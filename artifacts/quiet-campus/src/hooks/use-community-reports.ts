import { useQueryClient } from '@tanstack/react-query';
import { useListCommunityReports, useCreateCommunityReport, getListCommunityReportsQueryKey,
  type CommunityReportInput, type CommunityReports } from '@workspace/api-client-react';

/** Informational only. Never supply these observations to the sensory scorer. */
export function useCommunityReports(active: boolean) {
  const client = useQueryClient();
  const query = useListCommunityReports({ query: {
    queryKey: getListCommunityReportsQueryKey(), enabled: active,
    staleTime: 15_000, refetchInterval: active ? 60_000 : false, retry: false,
  } });
  const mutation = useCreateCommunityReport();
  const submit = async (input: CommunityReportInput) => {
    const report = await mutation.mutateAsync({ data: input });
    client.setQueryData<CommunityReports>(getListCommunityReportsQueryKey(), previous => ({
      storage: 'shared',
      reports: [report, ...(previous?.reports ?? []).filter(item => item.id !== report.id)].slice(0, 100),
    }));
    return report;
  };
  return {
    reports: query.data?.reports ?? [], storage: query.data?.storage,
    loading: query.isLoading, error: query.error,
    refresh: query.refetch, submit, submitting: mutation.isPending,
  };
}
