'use client';

import { useEffect, useRef, useState } from 'react';
import { useCafeStore } from '@/state/useCafeStore';
import { Panel } from './ui';

/**
 * Short text messages at your table (FR-016, P1). Scoped exactly like voice:
 * the server only delivers to people sitting at the same table.
 *
 * `embedded` is the phone layout: the dock has already chosen to show chat,
 * so collapsing it to a button inside its own sheet would be a dead end.
 */
export function ChatPanel({
  onSend,
  embedded = false,
}: {
  onSend: (body: string) => void;
  embedded?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLUListElement | null>(null);
  const messages = useCafeStore((state) => state.chat);
  const open = useCafeStore((state) => state.chatOpen);
  const unread = useCafeStore((state) => state.unreadChat);
  const setOpen = useCafeStore((state) => state.setChatOpen);
  const seated = Boolean(useCafeStore((state) => state.self?.seatId));
  const blocked = useCafeStore((state) => state.blockedUsers);

  useEffect(() => {
    if ((open || embedded) && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, open, embedded]);

  // Opening the chat tab counts as reading it, same as opening the panel.
  useEffect(() => {
    if (!embedded) return;
    setOpen(true);
    return () => setOpen(false);
  }, [embedded, setOpen]);

  if (!open && !embedded) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="pointer-events-auto rounded-xl border border-white/10 bg-espresso/85 px-3 py-2 text-xs text-cream shadow-panel backdrop-blur-md hover:border-caramel/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-caramel"
      >
        Trò chuyện tại bàn{unread > 0 ? ` · ${unread} mới` : ''}
      </button>
    );
  }

  return (
    <Panel
      title="Trò chuyện tại bàn"
      action={
        embedded ? null : (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded px-1.5 py-0.5 text-[11px] text-linen/70 hover:text-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-caramel"
          >
            Ẩn
          </button>
        )
      }
    >
      <ul
        ref={listRef}
        className={`mb-2 space-y-1.5 overflow-y-auto overscroll-contain pr-1 text-xs ${
          embedded ? 'max-h-[46vh] min-h-24' : 'max-h-40'
        }`}
      >
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
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-white/15 bg-charcoal px-2.5 py-1.5 text-xs text-cream placeholder:text-linen/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-caramel disabled:opacity-50 md:min-h-0 md:px-2"
        />
        <button
          type="submit"
          disabled={!seated || draft.trim().length === 0}
          className="min-h-11 rounded-lg bg-caramel px-3.5 text-xs font-medium text-espresso hover:bg-caramel/90 disabled:opacity-40 md:min-h-0 md:px-2.5"
        >
          Gửi
        </button>
      </form>
    </Panel>
  );
}
