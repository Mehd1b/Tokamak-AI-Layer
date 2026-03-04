'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  CrosshairMode,
  ColorType,
  LineStyle,
} from 'lightweight-charts';
import type { TimeSeriesPoint } from '@/hooks/useVaultHistory';

type TimeRange = '1H' | '6H' | '1D' | '1W' | 'All';

interface VaultChartProps {
  title: string;
  data: TimeSeriesPoint[];
  type: 'area' | 'line';
  valueSuffix?: string;
  precision?: number;
  isLoading: boolean;
  height?: number;
}

const TIME_RANGES: { label: TimeRange; seconds: number }[] = [
  { label: '1H', seconds: 60 * 60 },
  { label: '6H', seconds: 6 * 60 * 60 },
  { label: '1D', seconds: 24 * 60 * 60 },
  { label: '1W', seconds: 7 * 24 * 60 * 60 },
];

function filterByRange(data: TimeSeriesPoint[], range: TimeRange): TimeSeriesPoint[] {
  if (range === 'All' || data.length < 2) return data;
  const rangeConfig = TIME_RANGES.find((r) => r.label === range);
  if (!rangeConfig) return data;
  const cutoff = Math.floor(Date.now() / 1000) - rangeConfig.seconds;
  const filtered = data.filter((p) => p.time >= cutoff);
  return filtered.length < 2 ? data : filtered;
}

export function VaultChart({
  title,
  data,
  type,
  valueSuffix,
  precision = 4,
  isLoading,
  height = 300,
}: VaultChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | ISeriesApi<'Line'> | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState<TimeRange>('All');

  const filteredData = filterByRange(data, range);

  const formatValue = useCallback(
    (value: number) => {
      const formatted = value.toFixed(precision);
      return valueSuffix ? `${formatted} ${valueSuffix}` : formatted;
    },
    [precision, valueSuffix],
  );

  // Create chart on mount
  useEffect(() => {
    if (!containerRef.current || isLoading) return;

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#9ca3af',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.03)' },
        horzLines: { color: 'rgba(255,255,255,0.03)' },
      },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: {
          color: 'rgba(168,85,247,0.3)',
          style: LineStyle.Dashed,
          labelBackgroundColor: '#A855F7',
        },
        horzLine: {
          color: 'rgba(168,85,247,0.3)',
          style: LineStyle.Dashed,
          labelBackgroundColor: '#A855F7',
        },
      },
      rightPriceScale: {
        borderColor: 'rgba(255,255,255,0.05)',
      },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.05)',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: { vertTouchDrag: false },
    });

    let series: ISeriesApi<'Area'> | ISeriesApi<'Line'>;

    if (type === 'area') {
      series = chart.addAreaSeries({
        lineColor: '#A855F7',
        lineWidth: 2,
        topColor: 'rgba(168,85,247,0.4)',
        bottomColor: 'rgba(168,85,247,0.0)',
        priceFormat: { type: 'price', precision, minMove: Math.pow(10, -precision) },
      });
    } else {
      series = chart.addLineSeries({
        color: '#C084FC',
        lineWidth: 2,
        priceFormat: { type: 'price', precision, minMove: Math.pow(10, -precision) },
      });
    }

    // Tooltip via crosshair
    chart.subscribeCrosshairMove((param) => {
      if (!tooltipRef.current) return;

      if (
        !param.time ||
        !param.point ||
        param.point.x < 0 ||
        param.point.y < 0
      ) {
        tooltipRef.current.style.display = 'none';
        return;
      }

      const price = param.seriesData.get(series);
      if (!price || !('value' in price)) {
        tooltipRef.current.style.display = 'none';
        return;
      }

      const date = new Date((param.time as number) * 1000);
      const dateStr = date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      const timeStr = date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });

      tooltipRef.current.textContent = '';
      const dateDiv = document.createElement('div');
      dateDiv.style.cssText = 'font-size:11px;color:#9ca3af';
      dateDiv.textContent = `${dateStr} ${timeStr}`;
      const valueDiv = document.createElement('div');
      valueDiv.style.cssText = 'font-size:13px;color:#fff;margin-top:2px';
      valueDiv.textContent = formatValue(price.value);
      tooltipRef.current.appendChild(dateDiv);
      tooltipRef.current.appendChild(valueDiv);
      tooltipRef.current.style.display = 'block';

      const containerWidth = containerRef.current?.clientWidth ?? 0;
      const tooltipWidth = 160;
      let left = param.point.x + 12;
      if (left + tooltipWidth > containerWidth) {
        left = param.point.x - tooltipWidth - 12;
      }
      tooltipRef.current.style.left = `${left}px`;
      tooltipRef.current.style.top = `${param.point.y - 40}px`;
    });

    chartRef.current = chart;
    seriesRef.current = series;

    // ResizeObserver for responsive resize
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chart.applyOptions({ width: entry.contentRect.width });
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [isLoading, height, type, precision, formatValue]);

  // Update data when filteredData changes
  useEffect(() => {
    if (!seriesRef.current || !chartRef.current || filteredData.length === 0) return;

    const chartData = filteredData.map((p) => ({
      time: p.time as UTCTimestamp,
      value: p.value,
    }));

    seriesRef.current.setData(chartData);
    chartRef.current.timeScale().fitContent();
  }, [filteredData]);

  if (isLoading) {
    return (
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="h-5 bg-white/5 rounded w-40 animate-pulse" />
          <div className="flex gap-1">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-7 w-8 bg-white/5 rounded animate-pulse" />
            ))}
          </div>
        </div>
        <div className="animate-pulse bg-white/5 rounded" style={{ height }} />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="card">
        <h3
          className="text-lg font-light text-white mb-4"
          style={{ fontFamily: 'var(--font-serif), serif' }}
        >
          {title}
        </h3>
        <div
          className="flex items-center justify-center rounded border border-white/5"
          style={{ height }}
        >
          <span className="text-gray-500 text-sm font-mono">No data available yet</span>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3
          className="text-lg font-light text-white"
          style={{ fontFamily: 'var(--font-serif), serif' }}
        >
          {title}
        </h3>
        <div className="flex gap-1">
          {[...TIME_RANGES.map((r) => r.label), 'All' as TimeRange].map((label) => (
            <button
              key={label}
              onClick={() => setRange(label)}
              className={`px-2.5 py-1 rounded text-xs font-mono transition-colors border ${
                range === label
                  ? 'bg-[#A855F7]/20 text-[#C084FC] border-[#A855F7]/30'
                  : 'text-gray-500 border-transparent hover:text-gray-300 hover:bg-white/5'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="relative" style={{ height }}>
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
        <div
          ref={tooltipRef}
          className="absolute pointer-events-none z-10 px-3 py-2 rounded-lg border border-white/10 backdrop-blur-sm"
          style={{
            display: 'none',
            background: 'rgba(26,26,36,0.95)',
            minWidth: 120,
          }}
        />
      </div>
    </div>
  );
}
