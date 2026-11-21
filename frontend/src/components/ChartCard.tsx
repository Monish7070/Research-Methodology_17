import type { ReactNode } from "react";
import { Card, CardHeader, EmptyState, ErrorState, LoadingBlock } from "./ui";

export default function ChartCard({
  title,
  subtitle,
  action,
  loading,
  error,
  empty,
  height = 260,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  height?: number;
  children: ReactNode;
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader title={title} subtitle={subtitle} action={action} />
      <div className="px-2 py-4 sm:px-4" style={{ minHeight: height }}>
        {loading ? (
          <LoadingBlock height="h-[220px]" />
        ) : error ? (
          <ErrorState message={error} />
        ) : empty ? (
          <EmptyState title="No data yet" description="Charts populate once processing has produced stored results." />
        ) : (
          children
        )}
      </div>
    </Card>
  );
}
