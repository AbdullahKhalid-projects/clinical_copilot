import { Info, Pill, Sparkles, Stethoscope } from "lucide-react";
import { SHIFA_HELP_SECTIONS, SHIFA_STRONG_EXAMPLES } from "@/lib/shifa-guide-content";

export default function ShifaGuidePage() {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f5eee7_0%,_#fbf8f4_38%,_#fffdfb_100%)] text-[#4F3F39]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1540px] flex-col px-6 py-8 lg:px-10">
        <section className="relative overflow-hidden rounded-[36px] border border-[#E1D3C8] bg-[linear-gradient(135deg,_rgba(255,255,255,0.92),_rgba(249,241,233,0.96))] shadow-[0_32px_80px_rgba(92,70,59,0.14)]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(33,180,188,0.18),_transparent_24%),radial-gradient(circle_at_top_right,_rgba(229,206,65,0.16),_transparent_20%),radial-gradient(circle_at_bottom_right,_rgba(205,167,132,0.14),_transparent_24%)]" />

          <div className="relative grid gap-8 px-8 py-8 xl:grid-cols-[1.15fr_0.85fr] xl:px-10 xl:py-10">
            <div>
              <div className="mb-5 flex flex-wrap items-center gap-3">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-[18px] border border-white/80 bg-white/90 text-[#6D5751] shadow-[0_12px_28px_rgba(109,87,81,0.12)]">
                  <Info className="h-5 w-5" />
                </div>
                <div className="inline-flex items-center rounded-full border border-[#DCCEC3] bg-white/85 px-3.5 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-[#8A7268] shadow-sm">
                  Shifa Guide
                </div>
              </div>

              <h1 className="max-w-4xl text-[2.75rem] font-semibold leading-[1.05] tracking-[-0.04em] text-[#4F3F39] xl:text-[3.4rem]">
                Use the right mode before you ask.
              </h1>
              <p className="mt-4 max-w-3xl text-[16px] leading-8 text-[#75625B] xl:text-[17px]">
                Shifa works best when the question clearly signals whether you want patient-specific clinical safety, chart-aware memory, or broader PrimeKG drug and disease knowledge.
              </p>

              <div className="mt-6 grid gap-4 md:grid-cols-3">
                <div className="rounded-[24px] border border-[#E7D9CF] bg-white/80 px-4 py-4 shadow-[0_10px_24px_rgba(123,94,77,0.08)]">
                  <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-[#F5ECE4] text-[#7B645A]">
                    <Stethoscope className="h-4 w-4" />
                  </div>
                  <div className="text-sm font-semibold">Patient graph</div>
                  <p className="mt-1 text-sm leading-6 text-[#7A665F]">
                    Allergies, medications, conditions, and prescribing safety for the current patient.
                  </p>
                </div>

                <div className="rounded-[24px] border border-[#D3E6DF] bg-[linear-gradient(180deg,_rgba(247,252,250,0.98),_rgba(236,247,242,0.98))] px-4 py-4 shadow-[0_10px_24px_rgba(62,110,89,0.08)]">
                  <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-[#E7F3EE] text-[#477162]">
                    <Pill className="h-4 w-4" />
                  </div>
                  <div className="text-sm font-semibold">PrimeKG</div>
                  <p className="mt-1 text-sm leading-6 text-[#59766C]">
                    General drug and disease knowledge like indications, targets, and related diseases.
                  </p>
                </div>

                <div className="rounded-[24px] border border-[#E7D9CF] bg-white/80 px-4 py-4 shadow-[0_10px_24px_rgba(123,94,77,0.08)]">
                  <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-[#F7EFD7] text-[#8A7343]">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div className="text-sm font-semibold">Follow-up flow</div>
                  <p className="mt-1 text-sm leading-6 text-[#7A665F]">
                    Ask Shifa from a medication card, then drill deeper into the suggested next actions.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-[30px] border border-[#CFE4DB] bg-[linear-gradient(145deg,_rgba(244,250,247,0.96),_rgba(232,244,238,0.98))] p-6 shadow-[0_18px_42px_rgba(62,110,89,0.10)]">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#587C70]">
                PrimeKG toggle
              </div>
              <h2 className="mt-3 text-[1.55rem] font-semibold tracking-[-0.02em] text-[#426257]">
                Turn it on only for general knowledge.
              </h2>
              <p className="mt-3 text-[15px] leading-8 text-[#4F6C62]">
                Keep PrimeKG off when the answer should depend on the current patient’s allergies, history, labs, reports, or medication safety.
              </p>
              <p className="mt-3 text-[15px] leading-8 text-[#4F6C62]">
                Turn PrimeKG on when the question is about what a drug is used for, what it targets, or what diseases and drugs are linked in the biomedical graph.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-5 xl:grid-cols-3">
          {SHIFA_HELP_SECTIONS.map((section, index) => (
            <article
              key={section.title}
              className={`relative overflow-hidden rounded-[30px] border p-6 shadow-[0_18px_42px_rgba(115,88,73,0.08)] ${
                index === 1
                  ? "border-[#D9E7E2] bg-[linear-gradient(180deg,_rgba(248,252,250,0.98),_rgba(239,248,244,0.99))]"
                  : "border-[#E8DDD3] bg-[linear-gradient(180deg,_rgba(255,255,255,0.96),_rgba(249,244,239,0.98))]"
              }`}
            >
              <div
                className={`absolute right-0 top-0 h-32 w-32 rounded-full blur-3xl ${
                  index === 0 ? "bg-[#E8C9AE]/30" : index === 1 ? "bg-[#6BC5B7]/18" : "bg-[#E7D44C]/18"
                }`}
              />
              <div className="relative">
                <div className="mb-3 inline-flex rounded-full border border-white/75 bg-white/84 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8C756A]">
                  {section.badge}
                </div>
                <h2 className="text-[1.35rem] font-semibold tracking-[-0.02em] text-[#4F3F39]">
                  {section.title}
                </h2>
                <p className="mt-3 text-[15px] leading-8 text-[#78655E]">
                  {section.description}
                </p>
                <div className="mt-5 flex flex-wrap gap-2.5">
                  {section.examples.map((example) => (
                    <div
                      key={example}
                      className="rounded-full border border-white/85 bg-white/82 px-4 py-2.5 text-[12px] leading-5 text-[#6D5751] shadow-[0_6px_16px_rgba(128,103,91,0.08)]"
                    >
                      {example}
                    </div>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </section>

        <section className="mt-6 grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[28px] border border-[#E6D8CD] bg-white/84 p-6 shadow-[0_14px_34px_rgba(118,94,80,0.08)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#91786D]">
              Strong examples
            </div>
            <div className="mt-4 grid gap-3 text-sm text-[#64514B]">
              {SHIFA_STRONG_EXAMPLES.map((example) => (
                <div key={example} className="rounded-2xl bg-[#F8F2EC] px-4 py-3">
                  {example}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-[#E3D5CA] bg-[linear-gradient(135deg,_rgba(255,255,255,0.88),_rgba(246,239,232,0.95))] p-6 shadow-[0_14px_34px_rgba(118,94,80,0.08)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#91786D]">
              Quick rule
            </div>
            <p className="mt-4 text-[16px] leading-8 text-[#65524B]">
              If the question depends on <span className="font-semibold text-[#4F3F39]">this patient</span>, keep PrimeKG off and let Shifa use clinical memory, reports, metrics, and safety checks.
            </p>
            <p className="mt-3 text-[16px] leading-8 text-[#65524B]">
              If the question is about <span className="font-semibold text-[#4F3F39]">general drug or disease knowledge</span>, switch PrimeKG on first.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
