import { describe, expect, it } from 'vitest'
import { parseDifySseBlock } from '@/core/dify/sse'

describe('Dify workflow SSE parser', () => {
  it('parses workflow events and ignores stream completion markers', () => {
    expect(parseDifySseBlock('event: workflow_started\ndata: {"event":"workflow_started","task_id":"task-1"}')).toEqual({
      event: 'workflow_started',
      task_id: 'task-1',
    })
    expect(parseDifySseBlock('data: [DONE]')).toBeNull()
  })

  it('rejects non-object event payloads', () => {
    expect(() => parseDifySseBlock('data: ["invalid"]')).toThrow('malformed workflow event')
  })
})
