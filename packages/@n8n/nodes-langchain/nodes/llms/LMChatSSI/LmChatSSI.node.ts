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
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { ChatBedrockConverse } from '@langchain/aws';
import { NodeHttpHandler } from '@smithy/node-http-handler';

export class LmChatSSI implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'SSI DevBuddy Chat Model',
		name: 'lmChatSSI',
		icon: 'file:ssi-icon.svg',
		group: ['transform'],
		version: 1,
		description: 'Connect to SSI DevBuddy unified chat API with support for multiple LLM providers',
		defaults: {
			name: 'SSI DevBuddy Chat Model',
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
				description: 'Select the LLM model to use from your DevBuddy project',
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
							maxValue: 16000,
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

		const client = new BedrockRuntimeClient({
			endpoint: credentials.chatServerUrl as string,
			region: 'us-east-1',
			credentials: {
				accessKeyId: 'dummy',
				secretAccessKey: 'dummy',
			},
			requestHandler: new NodeHttpHandler({
				httpAgent: new (require('http').Agent)(),
				httpsAgent: new (require('https').Agent)(),
			}),
		});

		client.middlewareStack.add(
			(next) => async (args: any) => {
				if (args.request) {
					delete args.request.headers['authorization'];
					delete args.request.headers['x-amz-date'];
					delete args.request.headers['x-amz-security-token'];

					args.request.headers['x-api-key'] = credentials.apiKey as string;

					// Always redirect to our chat endpoint
					args.request.path = '/chat/n8n-stream';

					if (args.request.body) {
						try {
							const bodyString =
								typeof args.request.body === 'string'
									? args.request.body
									: args.request.body.toString('utf-8');

							const body = JSON.parse(bodyString);

							// Add llmKey without modifying the rest of the structure
							body.llmKey = modelName;

							const newBodyString = JSON.stringify(body);

							args.request.body = Buffer.from(newBodyString, 'utf-8');
							args.request.headers['content-length'] = Buffer.byteLength(
								newBodyString,
								'utf-8',
							).toString();
						} catch (error) {
							console.error('Error processing request body:', error);
						}
					}
				}
				return next(args);
			},
			{
				step: 'finalizeRequest',
				name: 'ssiDevBuddyAuthMiddleware',
			},
		);

		const model = new ChatBedrockConverse({
			client,
			model: 'anthropic.claude-3-sonnet-dummy-20240229-v1:0',
			region: 'us-east-1',
			temperature: options.temperature ?? 0.5,
			maxTokens: options.maxTokens ?? 16000,
			callbacks: [new N8nLlmTracing(this)],
			streaming: true,
		});

		return {
			response: model,
		};
	}
}
