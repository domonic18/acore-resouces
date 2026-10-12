import type { ComponentProps } from "react";

export const markdownComponents = {
  h1: (props: ComponentProps<"h1">) => (
    <h1
      className="mb-3 border-b border-border pb-2 text-lg font-bold text-text-primary"
      {...props}
    />
  ),
  h2: (props: ComponentProps<"h2">) => (
    <h2 className="mb-2 mt-5 text-base font-semibold text-text-primary" {...props} />
  ),
  h3: (props: ComponentProps<"h3">) => (
    <h3 className="mb-1.5 mt-4 text-sm font-semibold text-text-primary" {...props} />
  ),
  p: (props: ComponentProps<"p">) => (
    <p className="mb-2.5 text-sm leading-relaxed text-text-secondary" {...props} />
  ),
  ul: (props: ComponentProps<"ul">) => (
    <ul className="mb-2.5 list-disc space-y-1 pl-5 text-sm text-text-secondary" {...props} />
  ),
  ol: (props: ComponentProps<"ol">) => (
    <ol className="mb-2.5 list-decimal space-y-1 pl-5 text-sm text-text-secondary" {...props} />
  ),
  li: (props: ComponentProps<"li">) => <li className="leading-relaxed" {...props} />,
  a: (props: ComponentProps<"a">) => (
    <a
      className="text-accent underline decoration-accent/40 hover:decoration-accent"
      target="_blank"
      rel="noreferrer"
      {...props}
    />
  ),
  strong: (props: ComponentProps<"strong">) => (
    <strong className="font-semibold text-text-primary" {...props} />
  ),
  blockquote: (props: ComponentProps<"blockquote">) => (
    <blockquote
      className="mb-2.5 border-l-2 border-accent/40 bg-bg-hover px-3 py-1.5 text-xs text-text-tertiary"
      {...props}
    />
  ),
  code: (props: ComponentProps<"code">) => (
    <code
      className="rounded bg-bg-hover px-1 py-0.5 font-mono text-xs text-text-primary"
      {...props}
    />
  ),
  pre: (props: ComponentProps<"pre">) => (
    <pre
      className="mb-2.5 overflow-x-auto rounded-md border border-border bg-bg-elevated p-3 font-mono text-xs"
      {...props}
    />
  ),
  hr: () => <hr className="my-4 border-border" />,
  table: (props: ComponentProps<"table">) => (
    <table className="data-table mb-2.5 w-full text-sm" {...props} />
  ),
};
