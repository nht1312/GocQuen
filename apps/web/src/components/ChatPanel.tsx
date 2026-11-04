'use client';

import { useEffect, useRef, useState } from 'react';
import { useCafeStore } from '@/state/useCafeStore';
import { Panel } from './ui';

/**
 * Short text messages at your table (FR-016, P1). Scoped exactly like voice:
 * the server only delivers to people sitting at the same table.
 */
export function ChatPanel({ onSend }: { onSend: (body: string) => void }) {
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLUListElement | null>(null);
  const messages = useCafeStore((state) => state.chat);
  const open = useCafeStore((state) => state.chatOpen);
  const unread = useCafeStore((state) => state.unreadChat);
  const setOpen = useCafeStore((state) => state.setChatOpen);
  const seated = Boolean(useCafeStore((state) => state.self?.seatId));
  const blocked = useCafeStore((state) => state.blockedUsers);

  useEffect(() => {
    if (open && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, open]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="pointer-events-auto rounded-xl border border-white/10 bg-espresso/85 px-3 py-2 text-xs text-cream shadow-panel backdrop-blur-md hover:border-caramel/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-caramel"
      >
        Table chat{unread > 0 ? ` · ${unread} new` : ''}
      </button>
    );
  }

  return (
    <Panel
      title="Trò chuyện tại bàn"
      action={
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded px-1.5 py-0.5 text-[11px] text-linen/70 hover:text-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-caramel"
        >
          Hide
        </button>
      }
      className="w-[290px]"
    >
      <ul ref={listRef} className="mb-2 max-h-40 space-y-1.5 overflow-y-auto pr-1 text-xs">
        {messages.length === 0 ? (
          <li className="text-linen/50">
            {seated
              ? 'Chưa có tin nhắn nào. Tin nhắn ở đây chỉ đến được những người cùng bàn với bạn.'
              : 'Hãy ngồi vào một bàn để trò chuyện với những người ở đó.'}
          </li>
        ) : null}
        {messages
          .filter((message) => !blocked.includes(message.userId))
          .map((message) => (
            <li key={message.id}>
              <span className="font-medium text-caramel">{message.displayName}</span>
              <span className="text-linen/40">
                {' '}
                {new Date(message.sentAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              <p className="whitespace-pre-wrap break-words text-cream/90">{message.body}</p>
            </li>
          ))}
      </ul>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSend(draft);
          setDraft('');
        }}
        className="flex gap-1.5"
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={280}
          disabled={!seated}
          placeholder={seated ? 'Nói gì đó với bàn của bạn…' : 'Hãy chọn chỗ ngồi trước'}
          aria-label="Tin nhắn gửi tới bàn của bạn"
          className="min-w-0 flex-1 rounded-lg border border-white/15 bg-charcoal px-2 py-1.5 text-xs text-cream placeholder:text-linen/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-caramel disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!seated || draft.trim().length === 0}
          className="rounded-lg bg-caramel px-2.5 text-xs font-medium text-espresso hover:bg-caramel/90 disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </Panel>
  );
}
