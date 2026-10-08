"use client";

import { useCallback, useLayoutEffect } from "react";
import { useAuth } from "./auth/AuthProvider";
import { useSavedColleges } from "./saved/SavedCollegesProvider";
import { forgetDeadlinePlannerScope } from "./DeadlinePlanner";
import { forgetApplicantProfileScope } from "./ApplicantProfile";
import { forgetResearchScope } from "@/app/lib/research-drafts";
import { subscribeToAccountErasure } from "@/app/lib/account-browser-erasure";

export function useForgetAccountData() {
  const { invalidateDeletedAccount } = useAuth();
  const { forgetAccountScope } = useSavedColleges();
  return useCallback((scope: string) => {
    forgetResearchScope(scope);
    forgetApplicantProfileScope(scope);
    forgetDeadlinePlannerScope(scope);
    forgetAccountScope(scope);
    invalidateDeletedAccount(scope);
  }, [forgetAccountScope, invalidateDeletedAccount]);
}

export function AccountErasureCoordinator() {
  const forgetScope = useForgetAccountData();
  useLayoutEffect(() => subscribeToAccountErasure(forgetScope), [forgetScope]);
  return null;
}
