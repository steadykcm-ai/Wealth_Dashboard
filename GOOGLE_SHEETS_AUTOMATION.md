# Google Sheets 자동 저장 설정 (Apps Script)

## 개요
Google Sheets에 Apps Script를 추가하여 **매일 아침 8시**에 자산 현황을 자동으로 `Log_daily` 탭에 저장합니다.

---

## 1단계: Apps Script 에디터 열기

1. Google Sheets에서 **확장 프로그램** → **Apps Script** 클릭
2. 새로운 프로젝트 탭이 열립니다

---

## 2단계: 코드 복사

기존 코드를 모두 삭제하고 아래 코드를 붙여넣기합니다:

```javascript
var SPREADSHEET_ID = "1MdNxFQq6bBrvfm_5p6DGHYmuqQ4bsSQhgRMLsMdQcFI";
var LOG_TOTAL_TAB = "LOG_TOTAL";
var LOG_DAILY_TAB = "Log_daily";

function saveToLogDaily() {
  try {
    var sheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    var logTotalTab = sheet.getSheetByName(LOG_TOTAL_TAB);
    var logSheet = sheet.getSheetByName(LOG_DAILY_TAB);
    
    if (!logTotalTab || !logSheet) {
      Logger.log("Error: LOG_TOTAL or Log_daily tab not found");
      return;
    }
    
    var total = logTotalTab.getRange("D4:H4").getValues()[0];
    var stocks = logTotalTab.getRange("D5:H5").getValues()[0];
    var pension = logTotalTab.getRange("D6:H6").getValues()[0];
    var irp = logTotalTab.getRange("D7:H7").getValues()[0];
    var crypto = logTotalTab.getRange("D8:H8").getValues()[0];
    
    var today = new Date().toISOString().split('T')[0];
    
    var rowData = [today].concat(total).concat(stocks).concat(pension).concat(irp).concat(crypto);
    
    var values = logSheet.getRange("A:A").getValues();
    var existingRow = -1;
    for (var i = 2; i < values.length; i++) {
      var cellValue = values[i][0];
      if (cellValue && String(cellValue).substring(0, 10) === today) {
        existingRow = i + 1;
        break;
      }
    }
    
    if (existingRow > 0) {
      logSheet.getRange(existingRow, 1, 1, rowData.length).setValues([rowData]);
      Logger.log("Updated row " + existingRow);
    } else {
      logSheet.appendRow(rowData);
      Logger.log("Added new row");
    }
    
  } catch (error) {
    Logger.log("Error: " + error.toString());
  }
}

function onSchedule() {
  saveToLogDaily();
}
```

---

## 3단계: 프로젝트 저장

1. **Ctrl+S** (또는 **⌘+S** Mac)로 저장
2. 프로젝트 이름을 "Wealth Dashboard Auto Save"로 설정 (선택)

---

## 4단계: 시간 기반 트리거 설정

1. 왼쪽 패널에서 **트리거** (시계 아이콘) 클릭
2. **트리거 만들기** 클릭
3. 설정:
   - **실행할 함수**: `onSchedule` 선택
   - **이벤트 소스**: `시간 기반` 선택
   - **시간 유형**: `매일` 선택
   - **시간**: `오전 8:00 ~ 9:00` 선택
4. **저장** 클릭

---

## 5단계: 승인

Google이 권한 확인 대화를 띄웁니다:
1. 계정 선택
2. "이 앱은 확인되지 않음" → **고급** → **이동** 클릭
3. **허용** 클릭

---

## 테스트

### 수동 실행 (트리거 설정 전 테스트)
1. Apps Script 에디터에서 `onSchedule` 함수 선택
2. **실행** (▶️) 버튼 클릭
3. 로그 보기: **실행** → **로그** 클릭
   - "Updated row X" 또는 "Added new row" 메시지 확인
4. Google Sheets의 `Log_daily` 탭에 데이터가 추가되었는지 확인
5. **중요**: 저장된 값이 LOG_TOTAL 탭의 해당 셀 값과 정확하게 일치하는지 확인
   - 예: LOG_TOTAL D5 (Stocks 원금) = Log_daily F행의 Stocks 원금

---

## 주의사항

⚠️ **데이터 매핑 구조**

**LOG_TOTAL 탭 (읽는 곳):**
- **D4:H4**: Total (원금, 평가액, 수익금, 현금, total)
- **D5:H5**: Stocks (원금, 평가액, 수익금, 현금, total)
- **D6:H6**: Pension (원금, 평가액, 수익금, 현금, total)
- **D7:H7**: IRP (원금, 평가액, 수익금, 현금, total)
- **D8:H8**: Crypto (원금, 평가액, 수익금, 현금, total)

**Log_daily 탭 (저장되는 곳):**
- **A열**: 날짜
- **B:F**: Total 데이터 (5개 값)
- **G:K**: Stocks 데이터 (5개 값)
- **L:P**: Pension 데이터 (5개 값)
- **Q:U**: IRP 데이터 (5개 값)
- **V:Z**: Crypto 데이터 (5개 값)

---

## 문제 해결

### 데이터가 추가되지 않음
- **로그 확인**: Apps Script → 실행 → 로그에서 에러 메시지 확인
- **탭 이름 확인**: "LOG_TOTAL"과 "Log_daily" 탭이 정확하게 존재하는지 확인
- **권한 확인**: 계정이 스프레드시트 편집 권한이 있는지 확인

### 금액이 틀리게 표시됨
- **LOG_TOTAL 구조 확인**: D4:G4, D5:G5 등의 셀에 올바른 데이터가 있는지 확인
- **셀 범위 확인**: LOG_TOTAL 탭이 정확하게 D4부터 G8 범위에 데이터를 가지고 있는지 확인
- **로그에서 읽은 값 확인**: Apps Script 로그에서 "Updated row" 또는 "Added new row" 메시지 확인

---

## 다음 단계

- 대시보드에서 **총자산 추이 차트**를 통해 자동 저장된 데이터 확인
- 필요시 시간 변경: 트리거 → 수정 → 시간 재설정
