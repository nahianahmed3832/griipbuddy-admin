'use client';

import * as Popover from '@radix-ui/react-popover';
import { Info } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

let dismissActiveDefinition: (() => void) | undefined;

export function OverviewMetricHelp({ title, definition, estimated = false }: {
  title: string;
  definition: string;
  estimated?: boolean;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const pinned = useRef(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [open, setOpen] = useState(false);

  const close = useCallback(() => {
    clearTimeout(leaveTimer.current);
    if (dismissActiveDefinition === close) dismissActiveDefinition = undefined;
    pinned.current = false;
    setOpen(false);
  }, []);

  useEffect(() => () => {
    clearTimeout(leaveTimer.current);
    if (dismissActiveDefinition === close) dismissActiveDefinition = undefined;
  }, [close]);

  function show() {
    clearTimeout(leaveTimer.current);
    if (dismissActiveDefinition !== close) dismissActiveDefinition?.();
    dismissActiveDefinition = close;
    setOpen(true);
  }

  function leave() {
    clearTimeout(leaveTimer.current);
    if (!pinned.current && !trigger.current?.matches(':focus-visible')) {
      leaveTimer.current = setTimeout(close, 180);
    }
  }

  return <Popover.Root open={open} onOpenChange={next => { if (!next) close(); }}>
    <Popover.Anchor asChild>
      <span className="overview-metric-help"
        onPointerEnter={event => {
          if (event.pointerType === 'mouse') show();
        }}
        onPointerLeave={event => { if (event.pointerType === 'mouse') leave(); }}>
        <button ref={trigger} type="button" className={estimated ? 'overview-estimated' : undefined}
          aria-label={estimated ? undefined : title + ' definition'} aria-describedby={id}
          onFocus={event => { if (event.currentTarget.matches(':focus-visible')) show(); }}
          onBlur={close}
          onClick={() => {
            if (pinned.current) close();
            else {
              pinned.current = true;
              show();
            }
          }}>
          {estimated ? 'Estimated' : <Info size={14} aria-hidden="true"/>}
        </button>
        {!open && <span id={id} hidden>{definition}</span>}
      </span>
    </Popover.Anchor>
    <Popover.Portal>
      <Popover.Content id={id} className="overview-definition-popup" role="tooltip"
        side="bottom" align="start" sideOffset={6} collisionPadding={8}
        onPointerEnter={() => clearTimeout(leaveTimer.current)}
        onPointerLeave={leave}
        onOpenAutoFocus={event => event.preventDefault()}
        onCloseAutoFocus={event => event.preventDefault()}
        onInteractOutside={event => {
          if (trigger.current?.contains(event.target as Node)) event.preventDefault();
        }}>
        {definition}
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>;
}
