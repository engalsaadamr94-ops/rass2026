import { NextRequest } from 'next/server';
import { dispatch } from '@/server/router';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

type P = { params: Promise<{ path?: string[] }> };
const h = async (req: NextRequest, { params }: P) => dispatch(req, (await params).path || []);
export const GET = h, POST = h, PUT = h, DELETE = h;
