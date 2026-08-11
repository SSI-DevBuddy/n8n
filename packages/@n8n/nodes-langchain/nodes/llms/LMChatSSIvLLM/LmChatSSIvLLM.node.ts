import {
	NodeConnectionTypes,
	type INodeType,
	type INodeTypeDescription,
	type ISupplyDataFunctions,
	type SupplyData,
	type ILoadOptionsFunctions,
	type INodePropertyOptions,
} from 'n8n-workflow';

import { getConnectionHintNoticeField, N8nLlmTracing } from '@n8n/ai-utilities';
import { ChatOpenAI } from '@langchain/openai';

export class LmChatSSIvLLM implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'SSI DevBuddy Chat Model (vLLM)',
		name: 'lmChatSSIvLLM',
		icon: 'file:../LMChatSSI/ssi-icon.svg',
		group: ['transform'],
		version: 1,
		description: 'Connect to SSI DevBuddy vLLM models for on-premises deployments',
		defaults: {
			name: 'SSI DevBuddy Chat Model (vLLM)',
		},
		codex: {
			categories: ['AI'],
			subcategories: {
				AI: ['Language Models', 'Root Nodes'],
				'Language Models': ['Chat Models (Recommended)'],
			},
		},
		inputs: [],
		outputs: [NodeConnectionTypes.AiLanguageModel],
		outputNames: ['Model'],
		credentials: [
			{
				name: 'ssiDevBuddyApi',
				required: true,
			},
		],
		properties: [
			getConnectionHintNoticeField([NodeConnectionTypes.AiChain, NodeConnectionTypes.AiAgent]),
			{
				displayName: 'Model',
				name: 'model',
				type: 'options',
				description: 'Select the vLLM model to use from your DevBuddy project',
				default: '',
				typeOptions: {
					loadOptionsMethod: 'getAvailableLlms',
				},
			},
			{
				displayName: 'Options',
				name: 'options',
				placeholder: 'Add Option',
				description: 'Additional options to configure the model',
				type: 'collection',
				default: {},
				options: [
					{
						displayName: 'Sampling Temperature',
						name: 'temperature',
						default: 0.5,
						typeOptions: { maxValue: 2, minValue: 0, numberPrecision: 1 },
						description:
							'Controls randomness: Lower values result in less random completions. As the temperature approaches zero, the model will become deterministic and repetitive.',
						type: 'number',
					},
					{
						displayName: 'Maximum Number of Tokens',
						name: 'maxTokens',
						default: 16000,
						description: 'The maximum number of tokens to generate in the completion',
						type: 'number',
						typeOptions: {
							maxValue: 128000,
							minValue: 1,
						},
					},
				],
			},
		],
	};

	methods = {
		loadOptions: {
			async getAvailableLlms(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const credentials = await this.getCredentials('ssiDevBuddyApi');

				try {
					const response = await this.helpers.httpRequest({
						method: 'GET',
						url: `${credentials.chatServerUrl}/chat/n8n/available-llms`,
						headers: {
							'x-api-key': credentials.apiKey as string,
						},
					});

					const llms = response as string[];

					// Filter to only show vLLM models
					const EXCLUDED_MODELS = ['ChatGPT'];
					const filteredLlms = llms.filter((llm) => !EXCLUDED_MODELS.includes(llm));

					return filteredLlms.map((llm) => ({
						name: llm,
						value: llm,
					}));
				} catch (error) {
					console.error('Error fetching available LLMs:', error);
					return [];
				}
			},
		},
	};

	async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
		const credentials = await this.getCredentials('ssiDevBuddyApi');
		const modelName = this.getNodeParameter('model', itemIndex) as string;
		const options = this.getNodeParameter('options', itemIndex, {}) as {
			temperature?: number;
			maxTokens?: number;
		};

		// Use ChatOpenAI for vLLM (OpenAI-compatible API)
		// Set environment variable to bypass OpenAI key validation
		process.env.OPENAI_API_KEY = 'sk-dummy-key-for-custom-endpoint';

		const model = new ChatOpenAI({
			modelName: modelName,
			configuration: {
				baseURL: `${credentials.chatServerUrl}/chat/n8n-stream`,
				defaultHeaders: {
					'x-api-key': credentials.apiKey as string,
				},
			},
			temperature: options.temperature ?? 0.5,
			maxTokens: options.maxTokens ?? 16000,
			streaming: true,
			callbacks: [new N8nLlmTracing(this)],
		});

		return {
			response: model,
		};
	}
}
