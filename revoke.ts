import 'dotenv/config';
import { createWalletClient, http, getAddress, createPublicClient, defineChain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const RPC_URL = process.env.RPC!;
const CONTRACT = getAddress(process.env.REVOKE_7702_CONTRACT!);

const normalizePk = (k?: string) => k?.replace(/^0x/, '') ?? '';
export const victimAccount = privateKeyToAccount(`0x${normalizePk(process.env.VICTIMS)}`);
export const SponsorAccount = privateKeyToAccount(`0x${normalizePk(process.env.SPONSOR)}`);

const CHAIN_INFO: Record<number, { name: string, symbol: string }> = {
    1: { name: 'Ethereum', symbol: 'ETH' },
    11155111: { name: 'Sepolia', symbol: 'ETH' },
    56: { name: 'BNB Smart Chain', symbol: 'BNB' },
    43114: { name: 'Avalanche C-Chain', symbol: 'AVAX' },
    5000: { name: 'Mantle', symbol: 'MNT' },
    137: { name: 'Polygon', symbol: 'MATIC' },
    8453: { name: 'Base', symbol: 'ETH' },
};

export async function detectChain(RPC_URL: string) {
    console.log('[*] Detecting chain from RPC:', RPC_URL);
    const tempPublic = createPublicClient({ transport: http(RPC_URL) });
    const chainId = await tempPublic.getChainId();
    console.log('[*] Detected chainId:', chainId);

    const chainInfo = CHAIN_INFO[chainId] ?? { name: `Chain-${chainId}`, symbol: 'ETH' };
    console.log('[*] Chain info:', chainInfo);

    return defineChain({
        id: chainId,
        name: chainInfo.name,
        network: chainInfo.name.toLowerCase().replace(/\s+/g, '-'),
        nativeCurrency: { name: chainInfo.symbol, symbol: chainInfo.symbol, decimals: 18 },
        rpcUrls: { default: { http: [RPC_URL] } },
    });
}

async function initClients() {
    console.log('[*] Initializing clients...');
    const chain = await detectChain(RPC_URL);
    console.log('[*] Using chain:', chain.name);

    const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });

    return {
        victimClient: createWalletClient({ account: victimAccount, chain, transport: http(RPC_URL) }),
        SponsorClient: createWalletClient({ account: SponsorAccount, chain, transport: http(RPC_URL) }),
        publicClient
    };
}

async function main() {
    console.log('[*] Starting revoke flow...');
    console.log('[*] Victim address:', victimAccount.address);
    console.log('[*] Sponsor address:', SponsorAccount.address);
    console.log('[*] Revoke contract:', CONTRACT);

    const { victimClient, SponsorClient } = await initClients();

    console.log('[*] Victim signing authorization...');
    const authSelf = await victimClient.signAuthorization({
        contractAddress: CONTRACT,
        executor: CONTRACT
    });
    console.log('[+] Victim auth created');

    console.log('[*] Sponsor signing authorization...');
    const authRelayer = await SponsorClient.signAuthorization({
        contractAddress: CONTRACT,
        args: [CONTRACT]
    });
    console.log('[+] Sponsor auth created');

    console.log('[*] Sending revoke transaction...');
    const hash = await SponsorClient.sendTransaction({
        to: SponsorAccount.address,
        data: '0x',
        authorizationList: [authSelf, authRelayer],
        account: SponsorAccount,
    });

    console.log('[+] Revoke tx sent:', hash);
}

main().catch((err) => {
    console.error('[!] Error during execution:', err);
});
