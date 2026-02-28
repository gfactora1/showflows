import ConflictResultsPageEnriched from "./ui/ConflictResultsPage.enriched";

export default async function Page(props: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await props.params;

  return <ConflictResultsPageEnriched projectId={projectId} />;
}