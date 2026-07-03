interface MetricCardProps {
  label: string;
  value: string;
}

export function MetricCard({ label, value }: MetricCardProps) {
  return (
    <div className="card metric-card">
      <p className="card-title">{label}</p>
      <p className="metric-card-value">{value}</p>
    </div>
  );
}
