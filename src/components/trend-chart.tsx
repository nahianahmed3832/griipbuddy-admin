type Point = { key: string; label: string; tick: string; values: (number | null)[] };

export function TrendChart({ points, lines, label, format }: {
  points: Point[];
  lines: string[];
  label: string;
  format: (value: number) => string;
}) {
  const values = points.flatMap(point => point.values.filter((value): value is number => value !== null));
  const high = Math.max(1, ...values);
  const low = Math.min(0, ...values);
  const x = (index: number) => points.length > 1 ? 60 + index * 608 / (points.length - 1) : 364;
  const y = (value: number) => 166 - (value - low) / (high - low) * 146;
  const compact = new Intl.NumberFormat('en', { notation:'compact', maximumFractionDigits:1 });
  const last = points.length - 1;
  const labelCount = Math.min(6, last);
  const labels = new Set(labelCount > 0 ? Array.from({length:labelCount + 1}, (_, i) => Math.round(i * last / labelCount)) : [0]);

  return <>
    {values.some(value => value !== 0) ?
      <svg className="overview-chart" viewBox="0 0 700 200" role="img" aria-label={label}>
        {[1,.75,.5,.25,0].map(tick => {
          const value = low + (high - low) * tick;
          return <g key={tick}><line x1="60" x2="668" y1={y(value)} y2={y(value)}/>
            <text x="53" y={y(value) + 4} textAnchor="end">{compact.format(value)}</text></g>;
        })}
        {lines.map((line, series) => {
          const path = points.map((point,index) => {
            const value = point.values[series];
            return value === null ? '' : (index > 0 && points[index - 1].values[series] !== null ? 'L' : 'M') + x(index) + ',' + y(value);
          }).join(' ');
          return <g key={line} className={'trend-color-' + series}>
            <path d={path}/>
            {points.map((point,index) => {
              const value = point.values[series];
              return value !== null && <circle key={point.key} cx={x(index)} cy={y(value)} r={points.length > 32 ? 1.5 : 3}>
                <title>{`${point.label} · ${line} · ${format(value)}`}</title>
              </circle>;
            })}
          </g>;
        })}
        {points.map((point,index) => labels.has(index) &&
          <text key={point.key} x={x(index)} y="188" textAnchor={index === 0 && last > 0 ? 'start' : index === last && last > 0 ? 'end' : 'middle'}>{point.tick}</text>)}
      </svg> : <p className="overview-chart-empty muted">No sales activity in this period</p>}
    <div className="overview-chart-key">{lines.map((line,index) => <span className={'trend-color-' + index} key={line}>{line}</span>)}</div>
  </>;
}
