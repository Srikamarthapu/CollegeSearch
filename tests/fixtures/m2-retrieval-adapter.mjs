import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createKnowledgeRetriever} from '../../app/lib/adviser/retrieval.ts';
import {emptyAdviserPreferences} from '../../app/lib/adviser/contracts.ts';
const dataset=JSON.parse(readFileSync('data/colleges.json','utf8'));
const {releaseId}=JSON.parse(readFileSync('data/college-knowledge-release.json','utf8'));
const types={p_filters:'jsonb',p_residency_state:'text',p_limit:'integer',p_offset:'integer',p_unit_ids:'bigint[]',p_expected_release_id:'text',p_query_text:'text',p_query_embedding:'extensions.vector',p_embedding_model:'text',p_embedding_version:'text',p_match_count:'integer'};
const rpc=async(name,parameters)=>{
 assert.ok(['current_college_knowledge_release','filter_college_facts','hybrid_search_college_passages'].includes(name));
 const argumentsSql=Object.entries(parameters).map(([key,value])=>{assert.ok(types[key]);const literal=value===null?'NULL':Array.isArray(value)?`ARRAY[${value.map(Number).join(',')}]`:`'${(typeof value==='object'?JSON.stringify(value):String(value)).replaceAll("'","''")}'`;return `${key} => ${literal}::${types[key]}`;}).join(',');
 const sql=`begin; set local role anon; select coalesce(json_agg(r),'[]'::json) from public.${name}(${argumentsSql}) r; rollback;`;
 const run=spawnSync('docker',['exec','-i','collegesearch-goal-db-20261004','psql','-X','-q','-t','-A','-U','supabase_admin','-d','collegesearch_m2_verify','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8',maxBuffer:8*1024*1024});
 if(run.status!==0)throw new Error(run.stderr);
 return JSON.parse(run.stdout.trim());
};
const retrieve=createKnowledgeRetriever(dataset,releaseId,rpc);
const cases=[
 {name:'California engineering',preferences:{fields:['Engineering'],states:['CA']},check:c=>c.state==='CA'&&c.majors.some(m=>m.name==='Engineering'&&(m.bachelorsAvailable||m.associatesAvailable))},
 {name:'Texas resident net price',preferences:{states:['TX'],residencyState:'TX',annualBudget:25000,budgetBasis:'average-net-price'},check:c=>c.state==='TX'&&c.observations.averageNetPrice.value<=25000},
 {name:'Small campuses',preferences:{size:'small'},check:c=>c.observations.undergraduateEnrollment.value<5000},
 {name:'Northeast private tuition',preferences:{states:['NY','MA','CT','PA'],ownership:'Private nonprofit',annualBudget:70000,budgetBasis:'tuition'},check:c=>c.ownership==='Private nonprofit'&&c.observations.tuitionOutOfState.value<=70000},
 {name:'Specific comparison',ids:[110635,110671],preferences:{residencyState:'CA'},check:c=>[110635,110671].includes(c.unitId)},
 {name:'Unknown descriptive topic',preferences:{states:['OR']},searchText:'underwater basket fabrication zzyzx',check:c=>c.state==='OR'}
];
for(const c of cases){const result=await retrieve({preferences:{...emptyAdviserPreferences,...c.preferences},intent:'recommend',mentionedUnitIds:c.ids||[],question:'none',searchText:c.searchText||c.name});assert.ok(result.colleges.length>0,c.name);assert.ok(result.colleges.every(c.check),c.name);assert.equal(result.mode,'keyword');for(const p of result.passages)assert.ok(result.colleges.some(college=>college.unitId===p.unitId));console.log(JSON.stringify({case:c.name,colleges:result.colleges.length,passages:result.passages.length,mode:result.mode,pass:true}));}
