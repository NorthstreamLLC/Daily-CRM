"use client";

import { useState, useTransition } from "react";
import type { FunnelStage, LookupRow, Setting } from "@/lib/admin";
import { Badge, Button, Input, Notice, Select, cn } from "@/components/ui";
import { Check, Plus } from "@/components/icons";
import { addSource, setSourceActive, updateSetting, updateStage } from "../actions";

/* ------------------------------------------------------------ One setting */

export function SettingRow({ setting }: { setting: Setting }) {
  const [value, setValue] = useState(setting.value);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ error?: string; message?: string } | null>(null);

  const dirty = value !== setting.value;

  function save() {
    start(async () => setResult(await updateSetting(setting.key, value)));
  }

  return (
    <div className="border-b border-line px-4 py-3.5 last:border-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <label
            htmlFor={`setting-${setting.key}`}
            className="text-body font-medium text-ink"
          >
            {setting.label}
          </label>
          {setting.description && (
            <p className="mt-0.5 max-w-2xl text-small text-ink-muted">
              {setting.description}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {setting.value_type === "bool" ? (
            <Select
              id={`setting-${setting.key}`}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-auto min-w-[92px]"
            >
              <option value="true">On</option>
              <option value="false">Off</option>
            </Select>
          ) : (
            <Input
              id={`setting-${setting.key}`}
              value={value}
              inputMode={setting.value_type === "int" ? "numeric" : "text"}
              onChange={(e) => setValue(e.target.value)}
              className={cn("w-28", setting.value_type === "text" && "w-32")}
            />
          )}

          <Button
            size="sm"
            variant={dirty ? "primary" : "secondary"}
            disabled={!dirty}
            loading={pending}
            onClick={save}
          >
            {dirty ? "Save" : "Saved"}
          </Button>
        </div>
      </div>

      {result?.error && (
        <div className="mt-2">
          <Notice tone="danger">{result.error}</Notice>
        </div>
      )}
      {result?.message && !dirty && (
        <p className="mt-2 inline-flex items-center gap-1 text-caption text-success">
          <Check size={11} /> {result.message}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ Funnel stage */

export function StageRow({ stage }: { stage: FunnelStage }) {
  const [days, setDays] = useState(String(stage.followup_days));
  const [action, setAction] = useState(stage.next_action);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ error?: string; message?: string } | null>(null);

  const dirty = days !== String(stage.followup_days) || action !== stage.next_action;

  return (
    <div className="border-b border-line px-4 py-3.5 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-body font-medium text-ink">{stage.name}</span>
        <span className="tabular text-caption text-ink-subtle">
          {stage.playerCount.toLocaleString()}{" "}
          {stage.playerCount === 1 ? "player" : "players"}
        </span>
        {stage.is_ftd && <Badge tone="success">Counts as a deposit</Badge>}
        {stage.is_dead && <Badge tone="neutral">Dead</Badge>}
        {!stage.counts_as_lead && !stage.is_dead && (
          <Badge tone="neutral">Not counted as a lead</Badge>
        )}
      </div>

      <div className="mt-2.5 grid gap-2.5 sm:grid-cols-[110px_minmax(0,1fr)_auto] sm:items-end">
        <div>
          <label
            htmlFor={`days-${stage.name}`}
            className="mb-1 block text-label font-medium text-ink-muted"
          >
            Follow-up days
          </label>
          <Input
            id={`days-${stage.name}`}
            type="number"
            min={0}
            max={365}
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
        </div>

        <div>
          <label
            htmlFor={`action-${stage.name}`}
            className="mb-1 block text-label font-medium text-ink-muted"
          >
            What the rep is told to do
          </label>
          <Input
            id={`action-${stage.name}`}
            value={action}
            onChange={(e) => setAction(e.target.value)}
          />
        </div>

        <Button
          variant={dirty ? "primary" : "secondary"}
          disabled={!dirty}
          loading={pending}
          onClick={() =>
            start(async () =>
              setResult(
                await updateStage(stage.name, {
                  followup_days: Number(days),
                  next_action: action.trim(),
                })
              )
            )
          }
        >
          {dirty ? "Save" : "Saved"}
        </Button>
      </div>

      {result?.error && (
        <div className="mt-2">
          <Notice tone="danger">{result.error}</Notice>
        </div>
      )}
      {result?.message && !dirty && (
        <p className="mt-2 inline-flex items-center gap-1 text-caption text-success">
          <Check size={11} /> {result.message}
        </p>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- Sources */

export function SourcesEditor({ sources }: { sources: LookupRow[] }) {
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ error?: string; message?: string } | null>(null);

  return (
    <div>
      <ul className="border-b border-line">
        {sources.map((s) => (
          <li
            key={s.name}
            className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 last:border-0"
          >
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  "text-body",
                  s.active ? "text-ink" : "text-ink-subtle line-through"
                )}
              >
                {s.name}
              </span>
              <span className="tabular text-caption text-ink-subtle">
                {s.inUse.toLocaleString()} {s.inUse === 1 ? "player" : "players"}
              </span>
              {!s.active && <Badge tone="neutral">Retired</Badge>}
            </span>

            <Button
              size="sm"
              loading={pending}
              onClick={() =>
                start(async () => setResult(await setSourceActive(s.name, !s.active)))
              }
            >
              {s.active ? "Retire" : "Bring back"}
            </Button>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2 p-4">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New source name"
          aria-label="New source name"
          className="w-auto min-w-[200px] flex-1"
        />
        <Button
          variant="primary"
          icon={<Plus size={15} />}
          disabled={!name.trim()}
          loading={pending}
          onClick={() =>
            start(async () => {
              setResult(await addSource(name));
              setName("");
            })
          }
        >
          Add source
        </Button>
      </div>

      {result?.error && (
        <div className="px-4 pb-4">
          <Notice tone="danger">{result.error}</Notice>
        </div>
      )}
      {result?.message && (
        <div className="px-4 pb-4">
          <Notice tone="success">{result.message}</Notice>
        </div>
      )}
    </div>
  );
}
