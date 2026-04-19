"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtBRL, fmtNumber } from "@/lib/format";

const PALETTE = [
  "hsl(217 91% 60%)",
  "hsl(142 71% 45%)",
  "hsl(38 92% 50%)",
  "hsl(340 75% 55%)",
  "hsl(199 89% 48%)",
  "hsl(262 83% 58%)",
  "hsl(15 85% 55%)",
  "hsl(173 58% 39%)",
];

type AnyData = Record<string, number | string>;

export function MoneyLineChart({
  data,
  xKey,
  series,
  height = 260,
}: {
  data: AnyData[];
  xKey: string;
  series: Array<{ key: string; label: string; color?: string }>;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey={xKey} tickMargin={8} />
        <YAxis
          tickFormatter={(v) =>
            v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
          }
          tickMargin={8}
          width={48}
        />
        <Tooltip
          formatter={(v) => fmtBRL(Number(v))}
          labelClassName="text-foreground"
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map((s, i) => {
          const color = s.color ?? PALETTE[i % PALETTE.length];
          return (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={color}
              fill={color}
              fillOpacity={0.12}
              strokeWidth={2}
            />
          );
        })}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function MoneyBarChart({
  data,
  xKey,
  yKey,
  label,
  height = 260,
  horizontal = false,
  color,
}: {
  data: AnyData[];
  xKey: string;
  yKey: string;
  label: string;
  height?: number;
  horizontal?: boolean;
  color?: string;
}) {
  const fill = color ?? PALETTE[0];
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout={horizontal ? "vertical" : "horizontal"}
        margin={{ top: 8, right: 8, bottom: 0, left: horizontal ? 96 : 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        {horizontal ? (
          <>
            <XAxis
              type="number"
              tickFormatter={(v) =>
                v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
              }
            />
            <YAxis
              type="category"
              dataKey={xKey}
              width={140}
              interval={0}
              tick={{ fontSize: 11 }}
            />
          </>
        ) : (
          <>
            <XAxis dataKey={xKey} tickMargin={8} />
            <YAxis
              tickFormatter={(v) =>
                v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
              }
              tickMargin={8}
              width={48}
            />
          </>
        )}
        <Tooltip formatter={(v) => fmtBRL(Number(v))} />
        <Bar dataKey={yKey} name={label} fill={fill} radius={4} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function StatusDonut({
  data,
  height = 220,
}: {
  data: Array<{ name: string; value: number }>;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Tooltip
          formatter={(v, n) => [`${fmtNumber(Number(v))} relatórios`, String(n)]}
        />
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={50}
          outerRadius={78}
          paddingAngle={2}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Pie>
        <Legend
          verticalAlign="middle"
          align="right"
          layout="vertical"
          wrapperStyle={{ fontSize: 12 }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function NumericLineChart({
  data,
  xKey,
  series,
  height = 220,
}: {
  data: AnyData[];
  xKey: string;
  series: Array<{ key: string; label: string; color?: string }>;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey={xKey} />
        <YAxis />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map((s, i) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color ?? PALETTE[i % PALETTE.length]}
            strokeWidth={2}
            dot={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
