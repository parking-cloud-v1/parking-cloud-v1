'use client'
import { useEffect, useMemo, useState } from 'react'
import ui from '@/components/PlatformAdmin.module.css'

type ParkingLotOption = { id: string; name: string }
const STORAGE_KEY = 'current-work-parking-lot-id'
const COOKIE_KEY = 'current_work_parking_lot_id'
function setWorkLotCookie(parkingLotId: string) { document.cookie = `${COOKIE_KEY}=${encodeURIComponent(parkingLotId)}; path=/; max-age=31536000; samesite=lax` }

export default function WorkParkingLotSelector({ parkingLots }: { parkingLots: ParkingLotOption[] }) {
  const [selectedId, setSelectedId] = useState('')
  const selectedLot = useMemo(() => parkingLots.find(x => x.id === selectedId), [parkingLots, selectedId])
  useEffect(() => {
    if (!parkingLots.length) return
    if (parkingLots.length === 1) {
      const onlyId = parkingLots[0].id
      window.localStorage.setItem(STORAGE_KEY, onlyId)
      window.localStorage.setItem('monthly-rentals-current-lot', onlyId)
      setWorkLotCookie(onlyId); setSelectedId(onlyId); return
    }
    const savedId = window.localStorage.getItem(STORAGE_KEY) || window.localStorage.getItem('monthly-rentals-current-lot') || ''
    if (savedId && parkingLots.some(x => x.id === savedId)) { setSelectedId(savedId); setWorkLotCookie(savedId); return }
    setSelectedId('')
  }, [parkingLots])

  function changeLot(id: string) {
    setSelectedId(id)
    if (!id) {
      window.localStorage.removeItem(STORAGE_KEY); window.localStorage.removeItem('monthly-rentals-current-lot')
      document.cookie = `${COOKIE_KEY}=; path=/; max-age=0; samesite=lax`; return
    }
    window.localStorage.setItem(STORAGE_KEY, id); window.localStorage.setItem('monthly-rentals-current-lot', id); setWorkLotCookie(id); window.location.reload()
  }

  return <div className={ui.lotSelector}>
    <div className={ui.lotLabel}>目前工作停車場</div>
    {!parkingLots.length ? <div className={ui.lotName} style={{color:'#b91c1c'}}>目前沒有可使用的停車場</div>
      : parkingLots.length === 1 ? <><div className={ui.lotName}>{parkingLots[0].name}</div><div className={ui.lotHint}>此帳號目前固定使用此場站</div></>
      : <><select className={ui.lotSelect} value={selectedId} onChange={e=>changeLot(e.target.value)}><option value="">請選擇工作停車場</option>{parkingLots.map(lot=><option key={lot.id} value={lot.id}>{lot.name}</option>)}</select>{selectedLot && <div className={ui.lotHint}>現場作業將以「{selectedLot.name}」為準</div>}</>}
  </div>
}
