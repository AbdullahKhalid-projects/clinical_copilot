import {
  ComposerAddAttachment,
  ComposerAttachments,
  UserMessageAttachments,
} from "@/components/attachment";
import { MarkdownText } from "@/components/markdown-text";
import { PrimeKgFollowupTool } from "@/components/primekg-followup-tool";
import { ToolFallback } from "@/components/tool-fallback";
import { TooltipIconButton } from "@/components/tooltip-icon-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SHIFA_HELP_SECTIONS } from "@/lib/shifa-guide-content";
import { cn } from "@/lib/utils";
import {
  ActionBarMorePrimitive,
  ActionBarPrimitive,
  AuiIf,
  BranchPickerPrimitive,
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAuiState,
} from "@assistant-ui/react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  Info,
  Mic,
  MoreHorizontalIcon,
  PencilIcon,
  Pill,
  RefreshCwIcon,
  SquareIcon,
  UserRound,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { type FC, useState } from "react";

type ThreadProps = {
  patientName?: string;
  retrievalMode?: "normal" | "semantic";
  onToggleRetrievalMode?: () => void;
  primeKgMode?: boolean;
  onTogglePrimeKgMode?: () => void;
};

type RetrievalPreview = {
  mode?: string;
  query?: string;
  semanticMatches?: number;
  mergedChunkCount?: number;
  citationCount?: number;
  topDocuments?: Array<{
    chunkId?: string;
    title?: string;
    score?: number;
  }>;
};

function getSemanticRetrievalPreview(metadata: unknown): RetrievalPreview | null {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const retrieval = (metadata as { retrieval?: unknown }).retrieval;
  if (!retrieval || typeof retrieval !== "object") {
    return null;
  }

  const preview = retrieval as RetrievalPreview;
  if (preview.mode !== "semantic") {
    return null;
  }

  return preview;
}

export const Thread: FC<ThreadProps> = ({
  patientName = "Patient",
  retrievalMode = "normal",
  onToggleRetrievalMode,
  primeKgMode = false,
  onTogglePrimeKgMode,
}) => {
  return (
    <ThreadPrimitive.Root
      className="aui-root aui-thread-root @container flex h-full flex-col bg-background"
      style={{
        ["--thread-max-width" as string]: "100%",
        ["--composer-radius" as string]: "22px",
        ["--composer-padding" as string]: "8px",
      }}
    >
      <ThreadPrimitive.Viewport
        turnAnchor="top"
        autoScroll={false}
        scrollToBottomOnRunStart={false}
        scrollToBottomOnInitialize={true}
        scrollToBottomOnThreadSwitch={true}
        data-slot="aui_thread-viewport"
        className="relative flex flex-1 flex-col overflow-x-hidden overflow-y-auto scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="mx-auto flex h-full w-full max-w-(--thread-max-width) flex-1 flex-col pl-4 pr-0 pt-0">
          <AuiIf condition={(s) => s.thread.isEmpty}>
            <ThreadWelcome />
          </AuiIf>

          <div
            data-slot="aui_message-group"
            className="mb-10 flex flex-col gap-y-8 empty:hidden"
          >
            <ThreadPrimitive.Messages>
              {() => <ThreadMessage />}
            </ThreadPrimitive.Messages>
          </div>

          <ThreadPrimitive.ViewportFooter className="aui-thread-viewport-footer sticky bottom-0 mt-auto flex flex-col gap-2 overflow-visible rounded-t-(--composer-radius) bg-background pb-0">
            <ThreadScrollToBottom />
            <Composer
              patientName={patientName}
              retrievalMode={retrievalMode}
              onToggleRetrievalMode={onToggleRetrievalMode}
              primeKgMode={primeKgMode}
              onTogglePrimeKgMode={onTogglePrimeKgMode}
            />
          </ThreadPrimitive.ViewportFooter>
        </div>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
};

const ThreadMessage: FC = () => {
  const role = useAuiState((s) => s.message.role);
  const isEditing = useAuiState((s) => s.message.composer.isEditing);

  if (isEditing) return <EditComposer />;
  if (role === "user") return <UserMessage />;
  return <AssistantMessage />;
};

const ThreadScrollToBottom: FC = () => {
  return (
    <ThreadPrimitive.ScrollToBottom asChild>
      <button
        type="button"
        aria-label="Scroll to bottom"
        className="aui-thread-scroll-to-bottom absolute -top-14 right-4 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#E1D6CC] bg-[#F2ECE6] text-[#6F5B55] shadow-[0_8px_18px_rgba(109,87,81,0.14)] transition-all hover:-translate-y-0.5 hover:bg-[#EEE5DD] hover:text-[#5C4843] disabled:invisible"
      >
        <ArrowDownIcon className="h-4.5 w-4.5" />
      </button>
    </ThreadPrimitive.ScrollToBottom>
  );
};

const ThreadWelcome: FC = () => {
  return (
    <div className="aui-thread-welcome-root flex grow flex-col">
      <div className="aui-thread-welcome-center flex w-full grow flex-col">
        <div className="aui-thread-welcome-message flex w-full flex-col items-center px-6 pt-12 text-center sm:pt-16">
          <h1 className="aui-thread-welcome-message-inner fade-in slide-in-from-bottom-1 animate-in fill-mode-both font-serif text-3xl leading-tight duration-200">
            Hi, Im Shifa
          </h1>
          <p className="aui-thread-welcome-message-inner fade-in slide-in-from-bottom-1 animate-in fill-mode-both max-w-md pt-2 text-muted-foreground text-sm delay-75 duration-200">
            Your clinical copilot for focused questions, grounded answers, and clear next steps.
          </p>
        </div>
      </div>
    </div>
  );
};

const Composer: FC<{
  patientName: string;
  retrievalMode?: "normal" | "semantic";
  onToggleRetrievalMode?: () => void;
  primeKgMode?: boolean;
  onTogglePrimeKgMode?: () => void;
}> = ({
  patientName,
  retrievalMode = "normal",
  onToggleRetrievalMode,
  primeKgMode = false,
  onTogglePrimeKgMode,
}) => {
  return (
    <ComposerPrimitive.Root className="aui-composer-root relative flex w-full flex-col">
      <ComposerPrimitive.AttachmentDropzone asChild>
        <div
          data-slot="aui_composer-shell"
          className="flex w-full flex-col gap-1.5 rounded-(--composer-radius) border border-[#D8CDC3] bg-[#F7F3EE] px-2.5 py-2 transition-shadow focus-within:border-ring/75 focus-within:ring-2 focus-within:ring-ring/20 data-[dragging=true]:border-ring data-[dragging=true]:border-dashed data-[dragging=true]:bg-accent/50"
        >
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center rounded-lg border border-[#E5D7CD] bg-[#F2ECE6] px-1.5 py-0.5">
              <span className="mr-1.5 inline-flex h-6 w-6 items-center justify-center rounded-md bg-[#E9DFD7] text-[#7E6860]">
                <UserRound className="h-3.5 w-3.5" />
              </span>
              <span className="max-w-[10rem] truncate text-xs font-medium text-[#6D5751]">
                {patientName}
              </span>
            </div>
          </div>

          <ComposerAttachments />
          <ComposerPrimitive.Input
            placeholder={
              primeKgMode
                ? "Ask a PrimeKG drug or disease question..."
                : retrievalMode === "semantic"
                ? "Search your document library..."
                : "Ask a follow-up question..."
            }
            className="aui-composer-input h-8 max-h-20 min-h-8 w-full resize-none bg-transparent px-1.5 py-0.5 text-sm leading-5 font-medium text-[#6F4E4E] outline-none placeholder:text-[#8B6F6F]/80"
            rows={1}
            autoFocus
            aria-label="Message input"
          />
          <ComposerAction
            retrievalMode={retrievalMode}
            onToggleRetrievalMode={onToggleRetrievalMode}
            primeKgMode={primeKgMode}
            onTogglePrimeKgMode={onTogglePrimeKgMode}
          />
        </div>
      </ComposerPrimitive.AttachmentDropzone>
    </ComposerPrimitive.Root>
  );
};

const ComposerAction: FC<{
  retrievalMode?: "normal" | "semantic";
  onToggleRetrievalMode?: () => void;
  primeKgMode?: boolean;
  onTogglePrimeKgMode?: () => void;
}> = ({
  retrievalMode = "normal",
  primeKgMode = false,
  onTogglePrimeKgMode,
}) => {
  void retrievalMode;

  return (
      <div className="aui-composer-action-wrapper relative flex items-center justify-between gap-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <ComposerAddAttachment />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-full text-[#8E7878] hover:bg-[#EEE4DB] hover:text-[#735F5F]"
            aria-label="Shifa help"
            onClick={() => {
              const popup = window.open(
                "/shifa-guide",
                "shifa-guide",
                "popup=yes,width=1440,height=920,resizable=yes,scrollbars=yes"
              );
              popup?.focus();
            }}
          >
            <Info className="h-3.5 w-3.5" />
          </Button>
          <div
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 transition-colors",
              primeKgMode
                ? "border-[#2C7A64]/30 bg-[#2C7A64]/10"
                : "border-transparent hover:bg-muted/50"
            )}
          >
            <Pill
              className={cn(
                "h-3.5 w-3.5 shrink-0",
                primeKgMode ? "text-[#2C7A64]" : "text-muted-foreground"
              )}
            />
            <Label
              htmlFor="primekg-mode-switch"
              className={cn(
                "cursor-pointer select-none text-[11px] font-medium leading-none",
                primeKgMode ? "text-[#2C7A64]" : "text-muted-foreground"
              )}
            >
              PrimeKG
            </Label>
            <Switch
              id="primekg-mode-switch"
              checked={primeKgMode}
              onCheckedChange={onTogglePrimeKgMode}
              className="h-3.5 w-7 data-[state=checked]:bg-[#2C7A64]"
            />
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-full text-[#8E7878] hover:bg-[#EEE4DB] hover:text-[#735F5F]"
            aria-label="Voice input"
          >
            <Mic className="h-3 w-3" />
          </Button>

          <AuiIf condition={(s) => !s.thread.isRunning}>
            <ComposerPrimitive.Send asChild>
              <TooltipIconButton
                tooltip="Send message"
                side="bottom"
                type="button"
                variant="default"
                size="icon"
                className="aui-composer-send size-7 rounded-lg bg-[#C7B7BE] text-white hover:bg-[#B7A5AE]"
                aria-label="Send message"
              >
                <ArrowUpIcon className="aui-composer-send-icon size-3.5" />
              </TooltipIconButton>
            </ComposerPrimitive.Send>
          </AuiIf>
          <AuiIf condition={(s) => s.thread.isRunning}>
            <ComposerPrimitive.Cancel asChild>
              <Button
                type="button"
                variant="default"
                size="icon"
                className="aui-composer-cancel size-7 rounded-lg"
                aria-label="Stop generating"
              >
                <SquareIcon className="aui-composer-cancel-icon size-3 fill-current" />
              </Button>
            </ComposerPrimitive.Cancel>
          </AuiIf>
        </div>
      </div>
  );
};

const ShifaHelpDialog: FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}> = ({ open, onOpenChange }) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(97vw,1380px)] max-w-[1380px] overflow-hidden rounded-[36px] border border-[#E2D3C7] bg-[linear-gradient(135deg,_#FFFDFB_0%,_#F9F1E9_48%,_#F4EBE3_100%)] p-0 shadow-[0_36px_100px_rgba(83,63,58,0.24)]">
        <div className="relative overflow-hidden rounded-[36px]">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-[radial-gradient(circle_at_top_left,_rgba(39,180,188,0.18),_transparent_32%),radial-gradient(circle_at_top_right,_rgba(232,209,75,0.18),_transparent_30%),radial-gradient(circle_at_center,_rgba(255,255,255,0.72),_transparent_60%)]" />

          <DialogHeader className="relative border-b border-[#E8DBD0] px-8 py-7 text-left">
            <div className="mb-4 flex items-center gap-4">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-[18px] border border-white/80 bg-white/90 text-[#6D5751] shadow-[0_12px_28px_rgba(109,87,81,0.12)]">
                <Info className="h-5 w-5" />
              </div>
              <div className="inline-flex items-center rounded-full border border-[#DCCEC3] bg-white/85 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-[#8A7268] shadow-sm">
                Shifa Guide
              </div>
            </div>
            <DialogTitle className="text-[2.1rem] font-semibold tracking-[-0.03em] text-[#4F3F39]">
              Use the right mode before you ask
            </DialogTitle>
            <DialogDescription className="mt-2 max-w-4xl text-[15px] leading-7 text-[#78655E]">
              Shifa is strongest when the question clearly signals whether you want patient-specific clinical safety, chart-aware memory, or broader PrimeKG drug and disease knowledge.
            </DialogDescription>
          </DialogHeader>

          <div className="relative px-8 py-7">
            <div className="mb-5 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-[28px] border border-[#E6D9CF] bg-white/78 p-5 shadow-[0_12px_30px_rgba(123,94,77,0.08)] backdrop-blur-sm">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-[#4F3F39]">
                      What Shifa is best at
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-[#7A665F]">
                      Ask in plain language. Shifa decides whether to pull from patient metrics, previous documentation, the patient safety graph, or PrimeKG.
                    </p>
                  </div>
                  <div className="hidden rounded-2xl border border-[#E8DDD3] bg-[#FBF7F2] px-4 py-3 text-right xl:block">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-[#977F74]">
                      Best prompt style
                    </div>
                    <div className="mt-1 text-sm font-medium text-[#5D4B44]">
                      Specific and clinical
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] border border-[#CEE4DB] bg-[linear-gradient(135deg,_rgba(244,250,247,0.96),_rgba(232,244,238,0.98))] p-5 shadow-[0_12px_30px_rgba(62,110,89,0.1)]">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#5D7F72]">
                  PrimeKG toggle
                </div>
                <p className="mt-2 text-sm leading-7 text-[#4F6C62]">
                  Turn on <span className="font-semibold">PrimeKG</span> for general medication and disease knowledge. Leave it off when you need answers tied to the current patient’s allergies, history, labs, and prescribing safety.
                </p>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              {SHIFA_HELP_SECTIONS.map((section, index) => (
                <section
                  key={section.title}
                  className={cn(
                    "relative overflow-hidden rounded-[30px] border p-5 shadow-[0_16px_38px_rgba(115,88,73,0.08)]",
                    index === 0
                      ? "border-[#E8DDD3] bg-[linear-gradient(180deg,_rgba(255,255,255,0.96),_rgba(251,246,241,0.98))]"
                      : index === 1
                        ? "border-[#D9E7E2] bg-[linear-gradient(180deg,_rgba(248,252,250,0.98),_rgba(239,248,244,0.99))]"
                        : "border-[#E8DDD3] bg-[linear-gradient(180deg,_rgba(255,255,255,0.96),_rgba(249,244,239,0.98))]"
                  )}
                >
                  <div
                    className={cn(
                      "absolute right-0 top-0 h-28 w-28 rounded-full blur-3xl",
                      index === 0
                        ? "bg-[#E8C9AE]/30"
                        : index === 1
                          ? "bg-[#6BC5B7]/18"
                          : "bg-[#E7D44C]/18"
                    )}
                  />
                  <div className="relative">
                    <div className="mb-3 inline-flex rounded-full border border-white/75 bg-white/84 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8C756A]">
                      {index === 0 ? "Patient graph" : index === 1 ? "PrimeKG" : "Follow-up flow"}
                    </div>
                    <h3 className="text-[17px] font-semibold text-[#4F3F39]">
                      {section.title}
                    </h3>
                    <p className="mt-2 text-sm leading-7 text-[#78655E]">
                      {section.description}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2.5">
                      {section.examples.map((example) => (
                        <div
                          key={example}
                          className="rounded-full border border-white/85 bg-white/82 px-3.5 py-2 text-[12px] leading-5 text-[#6D5751] shadow-[0_6px_16px_rgba(128,103,91,0.08)]"
                        >
                          {example}
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              ))}
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
              <div className="rounded-[26px] border border-[#E6D8CD] bg-white/8 p-5 shadow-[0_10px_26px_rgba(118,94,80,0.08)] backdrop-blur-sm">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#91786D]">
                  Strong examples
                </div>
                <div className="mt-3 grid gap-2 text-sm text-[#64514B]">
                  <div className="rounded-2xl bg-[#F8F2EC] px-3 py-2.5">Can I prescribe amoxicillin to this patient?</div>
                  <div className="rounded-2xl bg-[#F8F2EC] px-3 py-2.5">Show the latest hemoglobin trend.</div>
                  <div className="rounded-2xl bg-[#F8F2EC] px-3 py-2.5">What does prednisone target?</div>
                </div>
              </div>

              <div className="rounded-[26px] border border-[#E3D5CA] bg-[linear-gradient(135deg,_rgba(255,255,255,0.84),_rgba(246,239,232,0.94))] p-5 shadow-[0_10px_26px_rgba(118,94,80,0.08)]">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#91786D]">
                  Quick rule
                </div>
                <p className="mt-3 text-[15px] leading-7 text-[#65524B]">
                  If the question depends on <span className="font-semibold text-[#4F3F39]">this patient</span>, keep PrimeKG off and let Shifa use clinical memory, reports, metrics, and safety checks.
                  If the question is about <span className="font-semibold text-[#4F3F39]">general drug or disease knowledge</span>, switch PrimeKG on first.
                </p>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const MessageError: FC = () => {
  return (
    <MessagePrimitive.Error>
      <ErrorPrimitive.Root className="aui-message-error-root mt-2 rounded-md border border-destructive bg-destructive/10 p-3 text-destructive text-sm dark:bg-destructive/5 dark:text-red-200">
        <ErrorPrimitive.Message className="aui-message-error-message line-clamp-2" />
      </ErrorPrimitive.Root>
    </MessagePrimitive.Error>
  );
};

const ReasoningCollapsible: FC<{ text: string }> = ({ text }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!text?.trim()) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="my-2">
      <CollapsibleTrigger className="flex items-center gap-1.5 rounded-md border border-border/50 bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/60 transition-colors cursor-pointer">
        <span>Thinking</span>
        <ChevronDownIcon
          className={cn("h-3 w-3 transition-transform duration-200", isOpen && "rotate-180")}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1.5 overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <div className="rounded-md border border-border/30 bg-muted/20 px-3 py-2 text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
          {text}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

const AssistantMessage: FC = () => {
  // reserves space for action bar and compensates with `-mb` for consistent msg spacing
  // keeps hovered action bar from shifting layout (autohide doesn't support absolute positioning well)
  // for pt-[n] use -mb-[n + 6] & min-h-[n + 6] to preserve compensation
  const ACTION_BAR_PT = "pt-1.5";
  const ACTION_BAR_HEIGHT = `-mb-7.5 min-h-7.5 ${ACTION_BAR_PT}`;
  const metadata = useAuiState((s) => s.message.metadata as unknown);
  const retrievalPreview = getSemanticRetrievalPreview(metadata);

  return (
    <MessagePrimitive.Root
      data-slot="aui_assistant-message-root"
      data-role="assistant"
      className="fade-in slide-in-from-bottom-1 relative animate-in duration-150"
    >
      <div
        data-slot="aui_assistant-message-content"
        className="wrap-break-word px-2 text-foreground leading-relaxed"
      >
        <MessagePrimitive.Parts
          components={{
            Text: MarkdownText,
            Reasoning: ReasoningCollapsible,
            tools: {
              by_name: {
                offer_medication_followups: PrimeKgFollowupTool,
              },
              Fallback: ToolFallback,
            },
          }}
        />
        {retrievalPreview && (
          <div className="mt-3 rounded-lg border border-[#E5D7CD] bg-[#F7F3EE] px-3 py-2 text-xs text-[#6D5751]">
            <div className="mb-1.5 font-semibold text-[#5B4741]">Retrieved Context</div>
            <div className="flex flex-wrap items-center gap-3">
              <span>matches: {retrievalPreview.semanticMatches ?? 0}</span>
              <span>merged: {retrievalPreview.mergedChunkCount ?? 0}</span>
              <span>citations: {retrievalPreview.citationCount ?? 0}</span>
            </div>
            {retrievalPreview.query ? (
              <p className="mt-1 truncate text-[11px] text-[#7A625A]">query: {retrievalPreview.query}</p>
            ) : null}
            {Array.isArray(retrievalPreview.topDocuments) && retrievalPreview.topDocuments.length > 0 ? (
              <div className="mt-2 space-y-1">
                {retrievalPreview.topDocuments.slice(0, 5).map((doc, index) => (
                  <div key={`${doc.chunkId || doc.title || "doc"}-${index}`} className="flex items-center justify-between gap-2">
                    <span className="truncate">{doc.title || "Untitled Source"}</span>
                    <span className="font-mono text-[11px]">{typeof doc.score === "number" ? doc.score : "-"}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )}
        <MessageError />
      </div>

      <div
        data-slot="aui_assistant-message-footer"
        className={cn("ml-2 flex items-center", ACTION_BAR_HEIGHT)}
      >
        <BranchPicker />
        <AssistantActionBar />
      </div>
    </MessagePrimitive.Root>
  );
};

const AssistantActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="aui-assistant-action-bar-root col-start-3 row-start-2 -ml-1 flex gap-1 text-muted-foreground"
    >
      <ActionBarPrimitive.Copy asChild>
        <TooltipIconButton tooltip="Copy">
          <AuiIf condition={(s) => s.message.isCopied}>
            <CheckIcon />
          </AuiIf>
          <AuiIf condition={(s) => !s.message.isCopied}>
            <CopyIcon />
          </AuiIf>
        </TooltipIconButton>
      </ActionBarPrimitive.Copy>
      <ActionBarPrimitive.Reload asChild>
        <TooltipIconButton tooltip="Refresh">
          <RefreshCwIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.Reload>
      <ActionBarMorePrimitive.Root>
        <ActionBarMorePrimitive.Trigger asChild>
          <TooltipIconButton
            tooltip="More"
            className="data-[state=open]:bg-accent"
          >
            <MoreHorizontalIcon />
          </TooltipIconButton>
        </ActionBarMorePrimitive.Trigger>
        <ActionBarMorePrimitive.Content
          side="bottom"
          align="start"
          className="aui-action-bar-more-content z-50 min-w-32 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <ActionBarPrimitive.ExportMarkdown asChild>
            <ActionBarMorePrimitive.Item className="aui-action-bar-more-item flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground">
              <DownloadIcon className="size-4" />
              Export as Markdown
            </ActionBarMorePrimitive.Item>
          </ActionBarPrimitive.ExportMarkdown>
        </ActionBarMorePrimitive.Content>
      </ActionBarMorePrimitive.Root>
    </ActionBarPrimitive.Root>
  );
};

const UserMessage: FC = () => {
  return (
    <MessagePrimitive.Root
      data-slot="aui_user-message-root"
      className="fade-in slide-in-from-bottom-1 grid animate-in auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] content-start gap-y-2 px-2 duration-150 [&:where(>*)]:col-start-2"
      data-role="user"
    >
      <UserMessageAttachments />

      <div className="aui-user-message-content-wrapper relative col-start-2 min-w-0">
        <div className="aui-user-message-content wrap-break-word peer rounded-2xl bg-muted px-4 py-2.5 text-foreground empty:hidden">
          <MessagePrimitive.Parts />
        </div>
        <div className="aui-user-action-bar-wrapper absolute top-1/2 left-0 -translate-x-full -translate-y-1/2 pr-2 peer-empty:hidden">
          <UserActionBar />
        </div>
      </div>

      <BranchPicker
        data-slot="aui_user-branch-picker"
        className="col-span-full col-start-1 row-start-3 -mr-1 justify-end"
      />
    </MessagePrimitive.Root>
  );
};

const UserActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="aui-user-action-bar-root flex flex-col items-end"
    >
      <ActionBarPrimitive.Edit asChild>
        <TooltipIconButton tooltip="Edit" className="aui-user-action-edit p-4">
          <PencilIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.Edit>
    </ActionBarPrimitive.Root>
  );
};

const EditComposer: FC = () => {
  return (
    <MessagePrimitive.Root
      data-slot="aui_edit-composer-wrapper"
      className="flex flex-col px-2"
    >
      <ComposerPrimitive.Root className="aui-edit-composer-root ml-auto flex w-full max-w-[85%] flex-col rounded-2xl bg-muted">
        <ComposerPrimitive.Input
          className="aui-edit-composer-input min-h-14 w-full resize-none bg-transparent p-4 text-foreground text-sm outline-none"
          autoFocus
        />
        <div className="aui-edit-composer-footer mx-3 mb-3 flex items-center gap-2 self-end">
          <ComposerPrimitive.Cancel asChild>
            <Button variant="ghost" size="sm">
              Cancel
            </Button>
          </ComposerPrimitive.Cancel>
          <ComposerPrimitive.Send asChild>
            <Button size="sm">Update</Button>
          </ComposerPrimitive.Send>
        </div>
      </ComposerPrimitive.Root>
    </MessagePrimitive.Root>
  );
};

const BranchPicker: FC<BranchPickerPrimitive.Root.Props> = ({
  className,
  ...rest
}) => {
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className={cn(
        "aui-branch-picker-root mr-2 -ml-2 inline-flex items-center text-muted-foreground text-xs",
        className,
      )}
      {...rest}
    >
      <BranchPickerPrimitive.Previous asChild>
        <TooltipIconButton tooltip="Previous">
          <ChevronLeftIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Previous>
      <span className="aui-branch-picker-state font-medium">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next asChild>
        <TooltipIconButton tooltip="Next">
          <ChevronRightIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
};
