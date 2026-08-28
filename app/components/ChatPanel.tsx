'use client';

import { ImagePlus, SendHorizontal } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  listMessages,
  removeChannel,
  sendMessage,
  subscribeToMessages,
} from '../lib/api';
import type { Message } from '../lib/types';

type Props = {
  orderId: string;
  userId: string;
};

export default function ChatPanel({ orderId, userId }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listMessages(orderId)
      .then((items) => {
        if (!cancelled) setMessages(items);
      })
      .catch((caught) =>
        setError(caught instanceof Error ? caught.message : 'No se cargó el chat.'),
      );

    const channel = subscribeToMessages(orderId, (message) => {
      setMessages((current) =>
        current.some((item) => item.id === message.id)
          ? current
          : [...current, message],
      );
    });

    return () => {
      cancelled = true;
      removeChannel(channel);
    };
  }, [orderId]);

  const canSend = useMemo(() => body.trim().length > 0 && !sending, [body, sending]);

  async function handleSend(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSend) return;

    setSending(true);
    setError(null);
    try {
      const message = await sendMessage(orderId, userId, body.trim());
      setMessages((current) =>
        current.some((item) => item.id === message.id)
          ? current
          : [...current, message],
      );
      setBody('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo enviar.');
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="chat-title">
      <div className="section-title">
        <div>
          <h2 id="chat-title">Chat del pedido</h2>
          <p>Solo cliente y profesional asignado pueden leerlo.</p>
        </div>
      </div>

      <div className="chat-list" aria-live="polite">
        {messages.length === 0 && (
          <div className="empty">Todavía no hay mensajes.</div>
        )}
        {messages.map((message) => (
          <article
            className={message.sender_id === userId ? 'message mine' : 'message'}
            key={message.id}
          >
            <span className="message-meta">
              {message.sender_id === userId ? 'Vos' : 'Participante'}
            </span>
            {message.body}
          </article>
        ))}
      </div>

      {error && <p className="alert">{error}</p>}

      <form className="chat-form" onSubmit={handleSend}>
        <label className="visually-hidden" htmlFor={`message-${orderId}`}>
          Mensaje
        </label>
        <input
          id={`message-${orderId}`}
          className="input"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Escribí un mensaje"
        />
        <button
          className="plain-icon-button"
          type="button"
          title="Adjuntar imagen"
          aria-label="Adjuntar imagen"
          disabled
        >
          <ImagePlus size={20} aria-hidden="true" />
        </button>
        <button
          className="icon-button"
          type="submit"
          title="Enviar mensaje"
          aria-label="Enviar mensaje"
          disabled={!canSend}
        >
          <SendHorizontal size={20} aria-hidden="true" />
        </button>
      </form>
    </section>
  );
}
