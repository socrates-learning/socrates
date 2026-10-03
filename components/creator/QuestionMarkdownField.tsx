'use client';

import { useRef, type RefObject } from 'react';
import type { OfficialContentFormat } from '@/lib/official-content-format';
import OfficialVisualField, { type OfficialVisualMemory, type OfficialVisualHandle } from './OfficialVisualField';

export type QuestionMarkdownState = {
  mode: 'write' | 'preview' | 'source';
  selectionStart: number;
  selectionEnd: number;
};

// Source, format, presentation and session history remain parent-owned across Search.
// This field has no persistence, navigation or image ownership.
export function QuestionMarkdownField({ label, ariaLabel, placeholder, value, format, onChange, state, onStateChange, disabled, readOnly, memory, handle, documentKey }: {
  label: string; ariaLabel: string; placeholder: string; value: string; format: OfficialContentFormat;
  onChange: (source: string, format: OfficialContentFormat) => void; state: QuestionMarkdownState;
  onStateChange: (state: QuestionMarkdownState) => void;
  disabled: boolean; readOnly: boolean; memory?: RefObject<OfficialVisualMemory | null>;
  handle?: RefObject<OfficialVisualHandle | null>; documentKey: string;
}) {
  const local = useRef<OfficialVisualMemory | null>(null);
  return <OfficialVisualField label={label} ariaLabel={ariaLabel} placeholder={placeholder}
    value={value} format={format} flavor="question" documentKey={documentKey} memory={memory || local} handle={handle}
    mode={state.mode} onMode={mode => onStateChange({ ...state, mode })}
    disabled={disabled} readOnly={readOnly} onChange={onChange} />;
}
