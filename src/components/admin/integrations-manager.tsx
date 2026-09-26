"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { disconnectIntegration, saveIntegrationSettings, testIntegration, type AdminIntegration } from "@/lib/actions/integrations";
import { INTEGRATION_PROVIDERS, type IntegrationField, type IntegrationProviderSpec } from "@/lib/integration-providers";
import { unexpectedErrorMessage } from "@/lib/action-result";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

function StatusBadge({ status }: { status: AdminIntegration }) {
  if (status.source === "env") return <Badge variant="outline">Using server settings</Badge>;
  if (status.configured) return <Badge variant="secondary">Connected</Badge>;
  if (status.source === "db") return <Badge variant="outline">Incomplete</Badge>;
  return <Badge variant="outline">Not connected</Badge>;
}

// A secret is never sent to the browser: the field shows whether one is
// saved, and typing a value replaces it. "Remove" clears it on save.
function SecretField({
  field,
  isSet,
  value,
  removing,
  onChange,
  onToggleRemove,
}: {
  field: IntegrationField;
  isSet: boolean;
  value: string;
  removing: boolean;
  onChange: (v: string) => void;
  onToggleRemove: () => void;
}) {
  const placeholder = removing ? "Will be removed on save" : isSet ? "•••••••• saved — type to replace" : field.placeholder;
  const common = { id: field.key, value, placeholder, disabled: removing, onChange: (e: { target: { value: string } }) => onChange(e.target.value), autoComplete: "off" };
  return (
    <div className="flex items-start gap-2">
      {field.kind === "textarea" ? <Textarea {...common} rows={3} className="font-mono text-xs" /> : <Input {...common} type="password" />}
      {isSet && !field.required && (
        <Button type="button" variant="ghost" size="sm" onClick={onToggleRemove}>
          {removing ? "Keep" : "Remove"}
        </Button>
      )}
    </div>
  );
}

function ProviderCard({ spec, status }: { spec: IntegrationProviderSpec; status: AdminIntegration }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() => ({ ...status.config }));
  const [removing, setRemoving] = useState<string[]>([]);
  const [isSaving, startSaving] = useTransition();
  const [isTesting, startTesting] = useTransition();
  const [isDisconnecting, startDisconnecting] = useTransition();

  const set = (key: string, value: string) => setValues((v) => ({ ...v, [key]: value }));

  function run<T>(
    start: (fn: () => Promise<void>) => void,
    action: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>,
    onOk: (data: T) => void
  ) {
    start(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        onOk(result.data);
      } catch (error) {
        toast.error(unexpectedErrorMessage(error, "Something went wrong. Please try again."));
      }
    });
  }

  function handleSave() {
    run(startSaving, () => saveIntegrationSettings(spec.id, values, removing), () => {
      toast.success(`${spec.label} saved`);
      setRemoving([]);
      setValues((v) => Object.fromEntries(Object.entries(v).filter(([k]) => !spec.fields.find((f) => f.key === k)?.secret)));
      router.refresh();
    });
  }

  function handleTest() {
    run(startTesting, () => testIntegration(spec.id), (message) => toast.success(message));
  }

  function handleDisconnect() {
    if (!confirm(`Disconnect ${spec.label}? Its saved credentials are deleted.`)) return;
    run(startDisconnecting, () => disconnectIntegration(spec.id), () => {
      toast.success(`${spec.label} disconnected`);
      setValues({});
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>{spec.label}</CardTitle>
          <StatusBadge status={status} />
        </div>
        <p className="text-sm text-muted-foreground">{spec.description}</p>
        {status.source === "env" && (
          <p className="text-xs text-muted-foreground">
            This workspace is still using the credentials set on the server. Saving here moves them into this workspace
            (anything left blank is carried over).
          </p>
        )}
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
        >
          {status.webhookUrl && (
            <div className="space-y-1">
              <Label>Webhook URL</Label>
              <Input readOnly value={status.webhookUrl} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
              <p className="text-xs text-muted-foreground">Register this URL in your {spec.label} account.</p>
            </div>
          )}
          {spec.fields.map((field) => (
            <div key={field.key} className="space-y-1">
              {field.kind === "boolean" ? (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={values[field.key] === "true"} onCheckedChange={(c) => set(field.key, c === true ? "true" : "false")} />
                  {field.label}
                </label>
              ) : (
                <>
                  <Label htmlFor={field.key}>
                    {field.label}
                    {field.required && <span className="text-destructive"> *</span>}
                  </Label>
                  {field.secret ? (
                    <SecretField
                      field={field}
                      isSet={status.secretsSet.includes(field.key)}
                      value={values[field.key] ?? ""}
                      removing={removing.includes(field.key)}
                      onChange={(v) => set(field.key, v)}
                      onToggleRemove={() =>
                        setRemoving((r) => (r.includes(field.key) ? r.filter((k) => k !== field.key) : [...r, field.key]))
                      }
                    />
                  ) : (
                    <Input
                      id={field.key}
                      value={values[field.key] ?? ""}
                      placeholder={field.placeholder ?? field.defaultValue}
                      onChange={(e) => set(field.key, e.target.value)}
                    />
                  )}
                </>
              )}
              {field.help && <p className="text-xs text-muted-foreground">{field.help}</p>}
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" loading={isSaving}>
              Save
            </Button>
            <Button type="button" size="sm" variant="outline" loading={isTesting} disabled={!status.configured} onClick={handleTest}>
              Test connection
            </Button>
            {status.source === "db" && (
              <Button type="button" size="sm" variant="ghost" loading={isDisconnecting} onClick={handleDisconnect}>
                Disconnect
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function IntegrationsManager({ integrations }: { integrations: AdminIntegration[] }) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {INTEGRATION_PROVIDERS.map((spec) => {
        const status = integrations.find((i) => i.provider === spec.id);
        return status ? <ProviderCard key={spec.id} spec={spec} status={status} /> : null;
      })}
    </div>
  );
}
