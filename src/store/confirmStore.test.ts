import { describe, it, expect, beforeEach } from 'vitest'
import { useConfirmStore } from './confirmStore'
beforeEach(() => useConfirmStore.setState({ request: null, _resolve: null }))
describe('confirmStore', () => {
  it('confirm() opens a request and resolves true on accept', async () => {
    const p = useConfirmStore.getState().confirm({ message: 'delete?' })
    expect(useConfirmStore.getState().request).not.toBeNull()
    useConfirmStore.getState().resolve(true)
    await expect(p).resolves.toBe(true)
    expect(useConfirmStore.getState().request).toBeNull()
  })
  it('resolves false on cancel', async () => {
    const p = useConfirmStore.getState().confirm({ message: 'x' })
    useConfirmStore.getState().resolve(false)
    await expect(p).resolves.toBe(false)
  })
})
