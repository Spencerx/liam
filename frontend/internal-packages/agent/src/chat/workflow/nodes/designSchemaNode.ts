import { operationsSchema } from '@liam-hq/db-structure'
import * as v from 'valibot'
import { DatabaseSchemaBuildAgent } from '../../../langchain/agents'
import type { BasePromptVariables } from '../../../langchain/utils/types'
import { convertSchemaToText } from '../../../utils/convertSchemaToText'
import type { WorkflowState } from '../types'

const NODE_NAME = 'designSchemaNode'

interface PreparedSchemaDesign {
  agent: DatabaseSchemaBuildAgent
  schemaText: string
}

// Define schema for BuildAgent response validation
const buildAgentResponseSchema = v.object({
  message: v.string(),
  schemaChanges: operationsSchema,
})

type BuildAgentResponse = v.InferOutput<typeof buildAgentResponseSchema>

/**
 * Parse structured response from buildAgent using valibot for type safety
 */
const parseStructuredResponse = (
  response: string,
): BuildAgentResponse | null => {
  try {
    // Try to parse as JSON first
    const parsed: unknown = JSON.parse(response)

    // Use valibot to validate and parse the structure
    const validationResult = v.safeParse(buildAgentResponseSchema, parsed)

    if (validationResult.success) {
      return {
        message: validationResult.output.message,
        schemaChanges: validationResult.output.schemaChanges,
      }
    }

    // Log validation issues for debugging
    console.warn(
      'BuildAgent response validation failed:',
      validationResult.issues,
    )
    return null
  } catch (error) {
    // If JSON parsing fails, log the error and return null
    console.warn('Failed to parse BuildAgent response as JSON:', error)
    return null
  }
}

/**
 * Apply schema changes and return updated state
 */
const applySchemaChanges = async (
  schemaChanges: BuildAgentResponse['schemaChanges'],
  buildingSchemaId: string,
  latestVersionNumber: number,
  message: string,
  state: WorkflowState,
): Promise<WorkflowState> => {
  const result = await state.repositories.schema.createVersion({
    buildingSchemaId,
    latestVersionNumber,
    patch: schemaChanges,
  })

  if (!result.success) {
    state.logger.error('Schema update failed:', {
      error: result.error || 'Failed to update schema',
    })
    return {
      ...state,
      generatedAnswer: message,
      error: result.error || 'Failed to update schema',
    }
  }

  return {
    ...state,
    generatedAnswer: message,
    error: undefined,
  }
}

/**
 * Handle schema changes if they exist
 */
const handleSchemaChanges = async (
  parsedResponse: BuildAgentResponse,
  state: WorkflowState,
): Promise<WorkflowState> => {
  if (parsedResponse.schemaChanges.length === 0) {
    return {
      ...state,
      generatedAnswer: parsedResponse.message,
    }
  }

  const buildingSchemaId = state.buildingSchemaId
  const latestVersionNumber = state.latestVersionNumber || 0

  return await applySchemaChanges(
    parsedResponse.schemaChanges,
    buildingSchemaId,
    latestVersionNumber,
    parsedResponse.message,
    state,
  )
}

/**
 * Handle buildAgent response processing
 */
const handleBuildAgentResponse = async (
  response: string,
  state: WorkflowState,
): Promise<WorkflowState> => {
  const parsedResponse = parseStructuredResponse(response)

  if (!parsedResponse) {
    console.warn(
      'Failed to parse buildAgent response as structured JSON, using raw response',
    )
    return {
      ...state,
      generatedAnswer: response,
    }
  }

  return await handleSchemaChanges(parsedResponse, state)
}

async function prepareSchemaDesign(
  state: WorkflowState,
): Promise<PreparedSchemaDesign> {
  const schemaText = convertSchemaToText(state.schemaData)

  // Create the agent instance
  const agent = new DatabaseSchemaBuildAgent()

  return {
    agent,
    schemaText,
  }
}

/**
 * Design Schema Node - DB Design & DDL Execution
 * Performed by dbAgent
 */
export async function designSchemaNode(
  state: WorkflowState,
): Promise<WorkflowState> {
  state.logger.log(`[${NODE_NAME}] Started`)

  const { agent, schemaText } = await prepareSchemaDesign(state)

  // Create prompt variables directly
  const promptVariables: BasePromptVariables = {
    schema_text: schemaText,
    chat_history: state.formattedHistory,
    user_message: state.userInput,
  }

  // Use agent's generate method with prompt variables
  const response = await agent.generate(promptVariables)
  const result = await handleBuildAgentResponse(response, state)

  state.logger.log(`[${NODE_NAME}] Completed`)
  return result
}
