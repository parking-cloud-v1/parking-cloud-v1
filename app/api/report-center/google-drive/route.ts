import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import {
  configuredDriveFolder,
  driveFolderUrl,
  uploadToGoogleDrive,
} from '@/lib/google-drive'

type Category =
  | 'attendance'
  | 'dengue'
  | 'violation'

function monthStart(
  month: string
) {
  return `${month}-01`
}

function nextMonthStart(
  month: string
) {
  const [
    year,
    monthNumber,
  ] =
    month
      .split('-')
      .map(Number)

  const date =
    new Date(
      year,
      monthNumber,
      1
    )

  return `${date.getFullYear()}-${String(
    date.getMonth() + 1
  ).padStart(2, '0')}-01`
}

function safeName(
  value: unknown
) {
  return String(
    value || ''
  )
    .replace(
      /[\\/:*?"<>|]/g,
      '_'
    )
    .replace(
      /\s+/g,
      '_'
    )
    .trim()
}

async function authorize() {
  const supabase =
    await createClient()

  const {
    data: {
      user,
    },
  } =
    await supabase
      .auth
      .getUser()

  if (!user) {
    return {
      supabase,
      user: null,
      profile: null,
    }
  }

  const {
    data:
      profile,
  } =
    await supabase
      .from(
        'profiles'
      )
      .select(
        'id, role, is_active'
      )
      .eq(
        'id',
        user.id
      )
      .maybeSingle()

  return {
    supabase,
    user,
    profile,
  }
}

export async function GET(
  request: Request
) {
  const {
    supabase,
    user,
    profile,
  } =
    await authorize()

  if (
    !user ||
    !profile?.is_active ||
    (
      profile.role !==
        'supervisor' &&
      profile.role !==
        'accountant'
    )
  ) {
    return NextResponse.json(
      {
        error:
          '沒有報表中心權限。',
      },
      {
        status: 403,
      }
    )
  }

  const url =
    new URL(
      request.url
    )

  const month =
    String(
      url.searchParams.get(
        'month'
      ) || ''
    ).trim()

  if (
    !/^\d{4}-\d{2}$/.test(
      month
    )
  ) {
    return NextResponse.json(
      {
        error:
          '月份格式錯誤。',
      },
      {
        status: 400,
      }
    )
  }

  const start =
    monthStart(
      month
    )

  const next =
    nextMonthStart(
      month
    )

  const [
    attendanceResult,
    dengueResult,
    violationResult,
  ] =
    await Promise.all([
      supabase
        .from(
          'monthly_attendance_sheets'
        )
        .select(
          'id'
        )
        .eq(
          'attendance_month',
          start
        ),

      supabase
        .from(
          'dengue_prevention_photos'
        )
        .select(
          'id'
        )
        .eq(
          'work_type',
          '自主檢查'
        )
        .eq(
          'file_kind',
          'report'
        )
        .gte(
          'work_date',
          start
        )
        .lt(
          'work_date',
          next
        ),

      supabase
        .from(
          'violation_parking_photos'
        )
        .select(
          'id'
        )
        .gte(
          'photo_date',
          start
        )
        .lt(
          'photo_date',
          next
        ),
    ])

  return NextResponse.json({
    configured: {
      attendance:
        Boolean(
          configuredDriveFolder(
            'attendance'
          )
        ),
      dengue:
        Boolean(
          configuredDriveFolder(
            'dengue'
          )
        ),
      violation:
        Boolean(
          configuredDriveFolder(
            'violation'
          )
        ),
    },

    folderUrls: {
      attendance:
        driveFolderUrl(
          configuredDriveFolder(
            'attendance'
          )
        ),
      dengue:
        driveFolderUrl(
          configuredDriveFolder(
            'dengue'
          )
        ),
      violation:
        driveFolderUrl(
          configuredDriveFolder(
            'violation'
          )
        ),
    },

    counts: {
      attendance:
        attendanceResult
          .data?.length ||
        0,

      dengue:
        dengueResult
          .data?.length ||
        0,

      violation:
        violationResult
          .data?.length ||
        0,
    },
  })
}

export async function POST(
  request: Request
) {
  const {
    supabase,
    user,
    profile,
  } =
    await authorize()

  if (
    !user ||
    !profile?.is_active ||
    (
      profile.role !==
        'supervisor' &&
      profile.role !==
        'accountant'
    )
  ) {
    return NextResponse.json(
      {
        error:
          '沒有報表中心權限。',
      },
      {
        status: 403,
      }
    )
  }

  const body =
    await request.json()

  const category =
    String(
      body?.category ||
      ''
    ) as Category

  const month =
    String(
      body?.month ||
      ''
    ).trim()

  if (
    ![
      'attendance',
      'dengue',
      'violation',
    ].includes(
      category
    )
  ) {
    return NextResponse.json(
      {
        error:
          '上傳類型錯誤。',
      },
      {
        status: 400,
      }
    )
  }

  if (
    !/^\d{4}-\d{2}$/.test(
      month
    )
  ) {
    return NextResponse.json(
      {
        error:
          '月份格式錯誤。',
      },
      {
        status: 400,
      }
    )
  }

  const folderId =
    configuredDriveFolder(
      category
    )

  if (!folderId) {
    return NextResponse.json(
      {
        error:
          '尚未設定此類別的 Google Drive Folder ID。',
      },
      {
        status: 400,
      }
    )
  }

  const start =
    monthStart(
      month
    )

  const next =
    nextMonthStart(
      month
    )

  const {
    data:
      lotRows,
  } =
    await supabase
      .from(
        'parking_lots'
      )
      .select(
        'id, name'
      )

  const lotMap =
    new Map(
      (
        lotRows ||
        []
      ).map(
        (
          lot: any
        ) => [
          lot.id,
          lot.name,
        ]
      )
    )

  const items: {
    bucket: string
    path: string
    fileName: string
    mimeType: string
  }[] = []

  if (
    category ===
    'attendance'
  ) {
    const {
      data,
      error,
    } =
      await supabase
        .from(
          'monthly_attendance_sheets'
        )
        .select(`
          id,
          parking_lot_id,
          attendance_month,
          storage_path,
          file_name,
          mime_type,
          uploaded_at
        `)
        .eq(
          'attendance_month',
          start
        )
        .order(
          'uploaded_at'
        )

    if (error) {
      return NextResponse.json(
        {
          error:
            error.message,
        },
        {
          status: 400,
        }
      )
    }

    for (
      let index = 0;
      index <
      (
        data ||
        []
      ).length;
      index++
    ) {
      const row =
        (
          data ||
          []
        )[index] as any

      const lot =
        safeName(
          lotMap.get(
            row.parking_lot_id
          ) ||
            '未知停車場'
        )

      items.push({
        bucket:
          'monthly-attendance',

        path:
          row.storage_path,

        fileName:
          `${month}_${lot}_簽到表_${String(
            index + 1
          ).padStart(
            2,
            '0'
          )}_${safeName(
            row.file_name
          )}`,

        mimeType:
          row.mime_type ||
          'application/octet-stream',
      })
    }
  }

  if (
    category ===
    'dengue'
  ) {
    const {
      data,
      error,
    } =
      await supabase
        .from(
          'dengue_prevention_photos'
        )
        .select(`
          id,
          parking_lot_id,
          work_date,
          storage_path,
          file_name,
          mime_type
        `)
        .eq(
          'work_type',
          '自主檢查'
        )
        .eq(
          'file_kind',
          'report'
        )
        .gte(
          'work_date',
          start
        )
        .lt(
          'work_date',
          next
        )
        .order(
          'work_date'
        )

    if (error) {
      return NextResponse.json(
        {
          error:
            error.message,
        },
        {
          status: 400,
        }
      )
    }

    for (
      let index = 0;
      index <
      (
        data ||
        []
      ).length;
      index++
    ) {
      const row =
        (
          data ||
          []
        )[index] as any

      const lot =
        safeName(
          lotMap.get(
            row.parking_lot_id
          ) ||
            '未知停車場'
        )

      items.push({
        bucket:
          'dengue-prevention',

        path:
          row.storage_path,

        fileName:
          `${row.work_date}_${lot}_登革熱自主檢查報表_${String(
            index + 1
          ).padStart(
            2,
            '0'
          )}_${safeName(
            row.file_name
          )}`,

        mimeType:
          row.mime_type ||
          'application/octet-stream',
      })
    }
  }

  if (
    category ===
    'violation'
  ) {
    const {
      data:
        photoRows,
      error:
        photoError,
    } =
      await supabase
        .from(
          'violation_parking_photos'
        )
        .select(`
          id,
          case_id,
          parking_lot_id,
          photo_type,
          photo_date,
          storage_path,
          file_name,
          mime_type
        `)
        .gte(
          'photo_date',
          start
        )
        .lt(
          'photo_date',
          next
        )
        .order(
          'photo_date'
        )

    if (photoError) {
      return NextResponse.json(
        {
          error:
            photoError.message,
        },
        {
          status: 400,
        }
      )
    }

    const caseIds =
      Array.from(
        new Set(
          (
            photoRows ||
            []
          ).map(
            (
              row: any
            ) =>
              row.case_id
          )
        )
      )

    let caseMap =
      new Map<
        string,
        any
      >()

    if (
      caseIds.length >
      0
    ) {
      const {
        data:
          caseRows,
      } =
        await supabase
          .from(
            'violation_parking_cases'
          )
          .select(`
            id,
            case_type,
            reserved_type,
            vehicle_plate,
            start_date
          `)
          .in(
            'id',
            caseIds
          )

      caseMap =
        new Map(
          (
            caseRows ||
            []
          ).map(
            (
              row: any
            ) => [
              row.id,
              row,
            ]
          )
        )
    }

    const caseText =
      (
        caseRow: any
      ) => {
        if (
          caseRow?.case_type ===
          'reserved_violation'
        ) {
          return caseRow
            .reserved_type ===
            'disabled'
            ? '身障違規'
            : '婦幼違規'
        }

        if (
          caseRow?.case_type ===
          'long_stay'
        ) {
          return '久停車'
        }

        return '無牌車'
      }

    const photoText:
      Record<
        string,
        string
      > = {
        overview:
          '車格和牌面全景',
        center_window:
          '置中全窗',
        right_window:
          '右側全窗',
        left_window:
          '左側全窗',
        daily:
          '每日追蹤',
        general:
          '現場照片',
      }

    for (
      let index = 0;
      index <
      (
        photoRows ||
        []
      ).length;
      index++
    ) {
      const row =
        (
          photoRows ||
          []
        )[index] as any

      const caseRow =
        caseMap.get(
          row.case_id
        )

      const lot =
        safeName(
          lotMap.get(
            row.parking_lot_id
          ) ||
            '未知停車場'
        )

      const plate =
        safeName(
          caseRow
            ?.vehicle_plate ||
          '無牌'
        )

      items.push({
        bucket:
          'violation-parking',

        path:
          row.storage_path,

        fileName:
          `${row.photo_date}_${lot}_${caseText(
            caseRow
          )}_${plate}_${photoText[
            row.photo_type
          ] ||
          row.photo_type}_${String(
            index + 1
          ).padStart(
            3,
            '0'
          )}_${safeName(
            row.file_name
          )}`,

        mimeType:
          row.mime_type ||
          'image/jpeg',
      })
    }
  }

  if (
    items.length ===
    0
  ) {
    return NextResponse.json(
      {
        error:
          '這個月份沒有可上傳的檔案。',
      },
      {
        status: 400,
      }
    )
  }

  let uploaded =
    0

  const failures:
    string[] = []

  for (
    const item of
    items
  ) {
    try {
      const {
        data:
          blob,
        error:
          downloadError,
      } =
        await supabase
          .storage
          .from(
            item.bucket
          )
          .download(
            item.path
          )

      if (
        downloadError ||
        !blob
      ) {
        throw new Error(
          downloadError
            ?.message ||
          'Storage 下載失敗'
        )
      }

      await uploadToGoogleDrive({
        folderId,
        fileName:
          item.fileName,
        mimeType:
          item.mimeType ||
          blob.type ||
          'application/octet-stream',
        bytes:
          await blob.arrayBuffer(),
      })

      uploaded++
    } catch (
      error: any
    ) {
      failures.push(
        `${item.fileName}：${
          error?.message ||
          '未知錯誤'
        }`
      )
    }
  }

  return NextResponse.json({
    uploaded,
    failed:
      failures.length,
    failures:
      failures.slice(
        0,
        10
      ),
    folderUrl:
      driveFolderUrl(
        folderId
      ),
  })
}
