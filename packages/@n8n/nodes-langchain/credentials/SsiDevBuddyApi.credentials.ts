import type { IAuthenticateGeneric, ICredentialType, INodeProperties } from 'n8n-workflow';

export class SsiDevBuddyApi implements ICredentialType {
	name = 'ssiDevBuddyApi';
	displayName = 'SSI DevBuddy API';
	documentationUrl = 'https://docs.ssi-devbuddy.com';
	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'Your SSI DevBuddy API key for authentication',
		},
		{
			displayName: 'Chat Server URL',
			name: 'chatServerUrl',
			type: 'string',
			default: 'http://127.0.0.1:55361',
			required: true,
			description: 'URL of the Python chat server',
			placeholder: 'http://127.0.0.1:55361',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'x-api-key': '={{$credentials.apiKey}}',
			},
		},
	};
}
