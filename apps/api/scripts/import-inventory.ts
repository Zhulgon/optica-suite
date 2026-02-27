import { PrismaClient, SegmentoMontura, MovementType } from '@prisma/client'
import * as xlsx from 'xlsx'
import * as path from 'path'

const prisma = new PrismaClient()

function mapSegmento(seg: string): SegmentoMontura {
  const s = (seg || '').toLowerCase()
  if (s.includes('dama')) return SegmentoMontura.DAMA
  if (s.includes('hombre')) return SegmentoMontura.HOMBRE
  return SegmentoMontura.NINOS
}

async function main() {
  // pon el excel aquí: apps/api/inventario_transformado_stock_v2_stock1a3.xlsx
  const filePath = path.resolve(process.cwd(), 'inventario_transformado_stock_v2_stock1a3.xlsx')

  const wb = xlsx.readFile(filePath)
  const ws = wb.Sheets['Stock_unificado']
  if (!ws) throw new Error('No existe la hoja "Stock_unificado" en el Excel')

  const rows = xlsx.utils.sheet_to_json<any>(ws)

  for (const r of rows) {
    const codigo = Number(r.codigo)
    const referencia = String(r.referencia ?? '').trim()
    const stock = Number(r.stock ?? 0)
    const precioVenta = Number(r.precioVenta ?? 0)
    const segmento = mapSegmento(String(r.segmento ?? ''))
    const conPlaqueta = Boolean(r.con_plaqueta)

    const frame = await prisma.frame.upsert({
      where: { codigo },
      update: { referencia, segmento, conPlaqueta, precioVenta, stockActual: stock },
      create: { codigo, referencia, segmento, conPlaqueta, precioVenta, stockActual: stock },
    })

    await prisma.inventoryMovement.create({
      data: {
        frameId: frame.id,
        type: MovementType.IN,
        quantity: stock,
        reason: 'Carga inicial (simulación)',
      },
    })
  }

  console.log('✅ Inventario importado')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => prisma.$disconnect())