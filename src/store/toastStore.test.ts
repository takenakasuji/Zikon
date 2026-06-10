import { describe, it, expect, beforeEach } from 'vitest'
import { useToastStore } from './toastStore'

beforeEach(() => useToastStore.setState({ toasts: [] }))

describe('toastStore', () => {
  it('pushes a toast with an id and returns it', () => {
    const id = useToastStore.getState().push({ kind: 'error', message: 'boom' })
    const toasts = useToastStore.getState().toasts
    expect(toasts.length).toBe(1)
    expect(toasts[0].id).toBe(id)
    expect(toasts[0].kind).toBe('error')
    expect(toasts[0].message).toBe('boom')
  })

  it('dismisses a toast by id', () => {
    const id = useToastStore.getState().push({ kind: 'info', message: 'hi' })
    useToastStore.getState().dismiss(id)
    expect(useToastStore.getState().toasts.length).toBe(0)
  })
})
