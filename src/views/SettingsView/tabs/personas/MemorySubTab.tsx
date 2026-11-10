import { defineComponent, ref, onMounted } from 'vue'
import { useMemory, type SessionMeta, type ConversationSession } from '@/composables/useMemory'

/**
 * MemorySubTab — browse and manage conversation sessions for a persona.
 * Material icons for roles, styled session cards, and manual narrative memory.
 */
export default defineComponent({
  name: 'MemorySubTab',

  props: {
    personaId: { type: String, required: true },
  },

  setup(props) {
    const {
      sessions,
      loading,
      loadSessions,
      getSession,
      deleteSession,
      clearSessions,
      newSession,
      addMemoryEntry,
    } = useMemory()

    const newMemoryText = ref('')
    const addingMemory = ref(false)
    const expandedSession = ref<ConversationSession | null>(null)
    const expanding = ref(false)

    onMounted(() => loadSessions(props.personaId))

    async function onAddMemory() {
      const text = newMemoryText.value.trim()
      if (!text || addingMemory.value) return

      addingMemory.value = true
      const result = await addMemoryEntry(text, props.personaId)
      if (result) newMemoryText.value = ''
      addingMemory.value = false
    }

    async function toggleSession(meta: SessionMeta) {
      if (expandedSession.value?.id === meta.id) {
        expandedSession.value = null
        return
      }
      expanding.value = true
      const full = await getSession(meta.id, props.personaId)
      expandedSession.value = full
      expanding.value = false
    }

    async function onDelete(id: string) {
      if (expandedSession.value?.id === id) expandedSession.value = null
      await deleteSession(id, props.personaId)
    }

    async function onClearAll() {
      expandedSession.value = null
      await clearSessions(props.personaId)
    }

    async function onNewSession() {
      expandedSession.value = null
      await newSession(props.personaId)
    }

    function formatDate(iso: string): string {
      const d = new Date(iso)
      return d.toLocaleDateString(undefined, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    }

    return {
      sessions,
      loading,
      newMemoryText,
      addingMemory,
      expandedSession,
      expanding,
      onAddMemory,
      toggleSession,
      onDelete,
      onClearAll,
      onNewSession,
      formatDate,
    }
  },

  render() {
    return (
      <div style="max-width: 720px;">
        <p class="subtab-description">
          Conversation history for this persona. Add a narrative memory below to save it to the
          persona's memory file and include it in future LLM context.
        </p>

        {/* Add narrative memory — mirrors the Facts tab entry control */}
        <div class="subtab-add-row">
          <input
            class="settings-field__input"
            style="flex: 1;"
            value={this.newMemoryText}
            onInput={(e: Event) => { this.newMemoryText = (e.target as HTMLInputElement).value }}
            onKeydown={(e: KeyboardEvent) => { if (e.key === 'Enter') this.onAddMemory() }}
            placeholder="Add a memory manually…"
            maxlength={2000}
            disabled={this.addingMemory}
          />
          <button
            class="settings-field__button"
            onClick={() => this.onAddMemory()}
            disabled={!this.newMemoryText.trim() || this.addingMemory}
          >
            <span class="settings-field__button-icon">add</span>
            Add
          </button>
        </div>

        {/* Conversation actions */}
        <div class="subtab-actions-row">
          <button class="settings-field__button" onClick={() => this.onNewSession()}>
            <span class="settings-field__button-icon">add</span>
            New Conversation
          </button>
          {this.sessions.length > 0 && (
            <button class="subtab-danger-btn" style="margin-top: 0;" onClick={() => this.onClearAll()}>
              <span class="subtab-danger-btn__icon">delete_sweep</span>
              Clear All
            </button>
          )}
        </div>

        {this.loading ? (
          <div class="settings-loading">Loading sessions…</div>
        ) : this.sessions.length === 0 ? (
          <div class="subtab-empty">
            <span class="subtab-empty__icon">chat_bubble_outline</span>
            <span>No conversations yet. Add a memory or start chatting with Ultron!</span>
          </div>
        ) : (
          <div class="subtab-cards">
            {this.sessions.map((s: SessionMeta) => {
              const isExpanded = this.expandedSession?.id === s.id
              return (
                <div key={s.id} class={['subtab-card subtab-card--session', isExpanded && 'subtab-card--expanded']}>
                  <div class="subtab-card__header" onClick={() => this.toggleSession(s)}>
                    <div class="subtab-card__header-info">
                      <span class="subtab-card__icon">forum</span>
                      <div>
                        <div class="subtab-card__title">{s.title}</div>
                        <div class="subtab-card__meta">{s.messageCount} messages · {this.formatDate(s.updatedAt)}</div>
                      </div>
                    </div>
                    <div class="subtab-card__header-actions">
                      <button
                        class="subtab-card__action subtab-card__action--delete"
                        onClick={(e: Event) => { e.stopPropagation(); this.onDelete(s.id) }}
                        title="Delete"
                      >delete</button>
                      <span class={['subtab-card__chevron', isExpanded && 'subtab-card__chevron--open']}>expand_more</span>
                    </div>
                  </div>
                  {isExpanded && this.expandedSession && (
                    <div class="subtab-card__messages">
                      {this.expanding ? (
                        <div class="subtab-msg subtab-msg--empty">Loading memory…</div>
                      ) : this.expandedSession.messages.map((msg, i) => (
                        <div key={i} class={['subtab-msg', `subtab-msg--${msg.role}`]}>
                          <span class="subtab-msg__icon">{msg.role === 'user' ? 'person' : 'smart_toy'}</span>
                          <span class="subtab-msg__text">{msg.text}</span>
                        </div>
                      ))}
                      {!this.expanding && this.expandedSession.messages.length === 0 && (
                        <div class="subtab-msg subtab-msg--empty">No messages in this session</div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  },
})
