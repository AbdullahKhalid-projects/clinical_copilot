import {
  ComposerAddAttachment,
  ComposerAttachments,
  UserMessageAttachments,
} from "@/components/attachment";
import { MarkdownText } from "@/components/markdown-text";
import { ToolFallback } from "@/components/tool-fallback";
import { TooltipIconButton } from "@/components/tooltip-icon-button";
import { Button } from "@/components/ui/button";
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
  BookOpenText,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  Mic,
  MoreHorizontalIcon,
  PencilIcon,
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
      <TooltipIconButton
        tooltip="Scroll to bottom"
        variant="outline"
        className="aui-thread-scroll-to-bottom absolute -top-12 z-10 self-center rounded-full p-4 disabled:invisible dark:border-border dark:bg-background dark:hover:bg-accent"
      >
        <ArrowDownIcon />
      </TooltipIconButton>
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
}> = ({ patientName, retrievalMode = "normal", onToggleRetrievalMode }) => {
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
              retrievalMode === "semantic"
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
          />
        </div>
      </ComposerPrimitive.AttachmentDropzone>
    </ComposerPrimitive.Root>
  );
};

const ComposerAction: FC<{
  retrievalMode?: "normal" | "semantic";
  onToggleRetrievalMode?: () => void;
}> = ({ retrievalMode = "normal", onToggleRetrievalMode }) => {
  const isSemantic = retrievalMode === "semantic";

  return (
    <div className="aui-composer-action-wrapper relative flex items-center justify-between gap-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <ComposerAddAttachment />
        <div
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 transition-colors",
            isSemantic
              ? "border-[#7469C3]/30 bg-[#7469C3]/10"
              : "border-transparent hover:bg-muted/50"
          )}
        >
          <BookOpenText
            className={cn(
              "h-3.5 w-3.5 shrink-0",
              isSemantic ? "text-[#7469C3]" : "text-muted-foreground"
            )}
          />
          <Label
            htmlFor="retrieval-mode-switch"
            className={cn(
              "cursor-pointer select-none text-[11px] font-medium leading-none",
              isSemantic ? "text-[#7469C3]" : "text-muted-foreground"
            )}
          >
            {isSemantic ? "Doc Search" : "Doc Search"}
          </Label>
          <Switch
            id="retrieval-mode-switch"
            checked={isSemantic}
            onCheckedChange={onToggleRetrievalMode}
            className="h-3.5 w-7 data-[state=checked]:bg-[#7469C3]"
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
            tools: { Fallback: ToolFallback },
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
