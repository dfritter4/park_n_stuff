interface SkeletonProps {
  height?: string;
  width?: string;
  count?: number;
}

export function Skeleton({ height = '1rem', width = '100%', count = 1 }: SkeletonProps) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="skeleton" aria-hidden="true" style={{ height, width }} />
      ))}
    </>
  );
}
