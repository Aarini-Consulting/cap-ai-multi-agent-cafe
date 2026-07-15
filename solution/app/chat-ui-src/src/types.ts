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
  { name: 'Cafe Assistant', path: '/api/cafe', description: 'Office cafe ordering' },
  { name: 'Supply Chain', path: '/api/supply-chain', description: 'Shipment risk monitoring' },
  { name: 'Escape the Office', path: '/api/adventure', description: 'Text adventure game' },
  { name: 'Undocumented API', path: '/api/undocumented-api', description: 'Advanced: broken vs fixed service' }
];
