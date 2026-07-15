export interface Message {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: Date;
}

export interface ServiceConfig {
  name: string;
  path: string;
  description: string;
}

export const SERVICES: ServiceConfig[] = [
  { name: 'Cafe Multi-Agent', path: '/api/cafe', description: 'Multi-agent cafe orchestrator' },
];
