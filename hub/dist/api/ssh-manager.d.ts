import { Express } from 'express';
import { SimpleHttpAgents } from './SimpleHttpAgents';
export declare class SSHManager {
    private publicKey;
    initialize(): Promise<void>;
    getPublicKey(): string | null;
    setupAgentSSH(agentIp: string, accessUser?: string): Promise<void>;
}
export declare function setupSSHEndpoints(app: Express, httpAgents: SimpleHttpAgents, sshManager: SSHManager): void;
//# sourceMappingURL=ssh-manager.d.ts.map