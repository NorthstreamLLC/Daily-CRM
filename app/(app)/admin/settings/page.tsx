import { Card, SectionHeader } from "@/components/ui";
import {
  getAllSettings,
  getFunnelStages,
  getSourcesAdmin,
  getWagerSources,
} from "@/lib/admin";
import { SettingRow, StageRow, SourcesEditor } from "./Editors";
import { WagerSync } from "./WagerSync";

export const dynamic = "force-dynamic";

const CATEGORY_TITLE: Record<string, string> = {
  queue: "The daily queue",
  vip: "VIP check-in schedules",
  general: "General",
};

const CATEGORY_HINT: Record<string, string> = {
  queue: "How the queue decides what needs doing and when to start warning you.",
  vip: "How often a transferred player is chased, and when the schedule goes quiet.",
  general: "Everything else.",
};

export default async function SettingsPage() {
  const [settings, stages, sources, wagerSources] = await Promise.all([
    getAllSettings(),
    getFunnelStages(),
    getSourcesAdmin(),
    getWagerSources(),
  ]);

  const categories = Array.from(new Set(settings.map((s) => s.category)));

  return (
    <>
      <div className="mb-5">
        <h2 className="text-h2 font-semibold tracking-tight text-ink">Settings</h2>
        <p className="mt-0.5 max-w-2xl text-body text-ink-muted">
          These used to be numbers buried in a script. Changing one here takes effect
          immediately for everyone — follow-up dates are worked out when a page loads,
          not stored, so nothing needs recalculating.
        </p>
      </div>

      {/* Funnel */}
      <section className="mb-8">
        <SectionHeader
          title="Funnel stages"
          count={stages.length}
          hint="Follow-up days set how long after the last contact someone becomes due again. The player count tells you how much a change will affect."
        />
        <Card padded={false}>
          {stages.map((stage) => (
            <StageRow key={stage.name} stage={stage} />
          ))}
        </Card>
      </section>

      {/* Settings by category */}
      {categories.map((category) => (
        <section key={category} className="mb-8">
          <SectionHeader
            title={CATEGORY_TITLE[category] ?? category}
            hint={CATEGORY_HINT[category]}
          />
          <Card padded={false}>
            {settings
              .filter((s) => s.category === category)
              .map((setting) => (
                <SettingRow key={setting.key} setting={setting} />
              ))}
          </Card>
        </section>
      ))}

      {/* Sources */}
      <section className="mb-8">
        <SectionHeader
          title="Lead sources"
          count={sources.length}
          hint="Retiring a source stops it being offered for new players. Everyone already using it keeps it, so past figures stay correct."
        />
        <Card padded={false}>
          <SourcesEditor sources={sources} />
        </Card>
      </section>

      {/* Wager sources */}
      <section>
        <SectionHeader
          title="Wager sources"
          count={wagerSources.length}
          hint="Each leaderboard API with its own key. Sync matches entries to players by Roobet username and keeps a dated snapshot per run, so wager-over-time stays answerable."
        />
        <Card padded={false}>
          <WagerSync
            sources={wagerSources}
            cronReady={Boolean(
              process.env.CRON_SECRET && process.env.SUPABASE_SERVICE_ROLE_KEY
            )}
          />
        </Card>
      </section>
    </>
  );
}
