import type { RunnableConfig } from '@langchain/core/runnables'
import { fromValibotSafeParse } from '@liam-hq/neverthrow'
import { ok, type Result } from 'neverthrow'
import * as v from 'valibot'
import { type Testcase, testcaseSchema } from './generateTestcase/agent'

const configSchema = v.object({
  toolCall: v.object({
    id: v.string(),
  }),
  configurable: v.object({
    testcases: v.array(testcaseSchema),
  }),
})

export const getToolConfigurable = (
  config: RunnableConfig,
): Result<{ testcases: Testcase[]; toolCallId: string }, Error> => {
  return fromValibotSafeParse(configSchema, config).andThen((value) =>
    ok({
      testcases: value.configurable.testcases,
      toolCallId: value.toolCall.id,
    }),
  )
}
