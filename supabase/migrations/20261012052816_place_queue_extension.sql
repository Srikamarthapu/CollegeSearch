-- pg_net is non-relocatable. This installation has not dispatched work yet;
-- refuse to recreate it if doing so would discard any request or response.
do $$
begin
  if exists (select 1 from net.http_request_queue) or exists (select 1 from net._http_response) then
    raise exception 'Preserve pg_net requests and responses before relocating the extension';
  end if;
end;
$$;
drop extension pg_net;
create extension pg_net with schema extensions;
