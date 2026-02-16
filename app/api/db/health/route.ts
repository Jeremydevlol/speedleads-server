import { NextRequest, NextResponse } from 'next/server'
import pool from '../../../../config/db'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    console.log('🔍 Testing database connection...')
    
    // Test de conexión simple
    const result = await pool.query('SELECT 1 as test, NOW() as timestamp')
    
    console.log('✅ Database connection successful')
    
    return NextResponse.json({ 
      success: true, 
      message: 'Database connection OK',
      test: result.rows[0],
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('❌ Database connection failed:', error)
    
    return NextResponse.json({ 
      success: false, 
      message: 'Database connection failed',
      error: error.message,
      code: error.code,
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}
