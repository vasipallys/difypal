// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ApiTesterModal } from '@/renderer/components/ApiTesterModal'
import { parseDsl } from '@/core/dsl/parser'

describe('API tester modal', () => {
  it('creates editable fields from the workflow Start node', () => {
    const dsl = parseDsl(`version: 0.6.0
kind: app
app:
  name: Tester
  mode: workflow
workflow:
  graph:
    nodes:
      - id: start
        data:
          type: start
          variables:
            - variable: query
              label: Customer query
              type: paragraph
              required: true
    edges: []
`).document

    render(
      <ApiTesterModal
        runtime={{
          running: true,
          baseUrl: 'http://127.0.0.1:12345/v1',
          apiKey: 'dsl_test',
          activeRuns: 0,
        }}
        dsl={dsl}
        onClose={() => {}}
      />,
    )

    expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true')
    expect(screen.getByTestId('api-operation')).toBeTruthy()
    expect(screen.getByTestId('api-input-query')).toBeTruthy()
    expect(screen.getByText('Customer query *')).toBeTruthy()
    expect(screen.getByTestId('send-api-request')).toBeTruthy()
  })
})
