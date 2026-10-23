"use client";

import React, { useState } from "react";

import type { ChoiceBlock, ChoiceOption } from "@loomic/shared";

type ChoiceBlockViewProps = {
  block: ChoiceBlock;
  onSelect: ((block: ChoiceBlock, option: ChoiceOption) => void) | undefined;
  disabled?: boolean;
};

export const ChoiceBlockView = React.memo(function ChoiceBlockView({
  block,
  onSelect,
  disabled = false,
}: ChoiceBlockViewProps) {
  const [selected, setSelected] = useState<string[]>([]);

  const handleSelect = (option: ChoiceOption) => {
    if (selected.includes(option.id)) return;
    const next = block.multiple ? [...selected, option.id] : [option.id];
    setSelected(next);
    onSelect?.(block, option);
  };

  return (
    <div className="rounded-xl border border-border bg-card/80 p-3 shadow-sm">
      <div className="mb-2 text-sm font-medium text-foreground">{block.title}</div>
      <div className="grid gap-2 sm:grid-cols-2">
        {block.options.map((option) => {
          const isSelected = selected.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              disabled={disabled || isSelected || (!block.multiple && selected.length > 0)}
              onClick={() => handleSelect(option)}
              className="rounded-lg border border-border px-3 py-2 text-left transition-colors hover:border-primary hover:bg-primary/5 disabled:cursor-default disabled:opacity-60"
            >
              <span className="block text-sm font-medium text-foreground">{option.label}</span>
              {option.description && (
                <span className="mt-0.5 block text-xs text-muted-foreground">{option.description}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
});
