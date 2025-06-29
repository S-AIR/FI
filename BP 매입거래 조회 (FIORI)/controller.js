sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/odata/v2/ODataModel",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",              // 🔥 추가됨: 필터 기능
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast"
   
], function (Controller, ODataModel, JSONModel, Filter, FilterOperator, MessageToast) {
    "use strict";


    return Controller.extend("zsair.bpsumchart.controller.bpsum_chart", {
         // 🔽 여기에 위치
    formatAmountWithComma: function (sValue) {
        if (!sValue) return "0";
        return Number(sValue).toLocaleString();
    },
    
        onInit: function () {
            var oODataModel = new ODataModel("/sap/opu/odata/sap/ZVSAIR_BPVIEW01_SRV/");
            this._detailModel = new ODataModel("/sap/opu/odata/sap/ZCDS_ITEM02_20_CDS/");
            
            this._oODataModel = oODataModel;

            // 🟨 [수정] 초기 조회 제거하고 기본값만 설정
            var oView = this.getView();
            oView.byId("yearSelect").setSelectedKey("2025");
            oView.byId("monthSelect").setSelectedKey("01");
        },

        onSearchYearMonth: function () {
            var oView = this.getView();
            var sYear = oView.byId("yearSelect").getSelectedKey();
            var sMonth = oView.byId("monthSelect").getSelectedKey();

            // 🟨 [추가] 조회조건 미입력 시 경고 메시지
            if (!sYear || !sMonth) {
                MessageToast.show("조회조건을 모두 선택해주세요.");
                return;
            }

            this._loadChartData(sYear, sMonth);
            this._loadTableData(sYear, sMonth); // ✅ 하단 테이블 추가: 상세 조회 호출

        },
        _loadChartData: function (sYear, sMonth) {
            var oView = this.getView();
            var oODataModel = this._oODataModel;
            var aFilters = [
                new Filter("Gjahr", FilterOperator.EQ, sYear),
                new Filter("Zmonat", FilterOperator.EQ, sMonth)
            ];

            // 🔍 필터 로그
            console.log("▶ 필터 조건 확인:", sYear, sMonth);
            console.log("▶ 요청에 적용된 필터 배열:", aFilters);

            this._oODataModel.read("/BPSearchsumSet", {
                filters: aFilters,
                success: function (oData) {

                    // ✅ 콘솔에 찍어서 데이터 구조 확인
                    console.log("📊 바인딩할 데이터 확인:", oData);
                    console.log("📦 results 배열:", oData.results);


                    if (!oData.results.length) {
                        // 🔥 이전 데이터 제거
                        const oEmptyModel = new JSONModel({ BPSearchsumSet: [] });
                        oView.byId("idVizFrame").setModel(oEmptyModel); 

                        MessageToast.show("조회된 데이터가 없습니다.");
                        return;
                    }

                    // 🔥 숫자 변환 필수!
                    oData.results.forEach(function (item) {
                        item.Totaldmbtr = Number(item.Totaldmbtr);
                    });

                     // 🟧 전체 데이터 저장 (팝업에서 BP 클릭 시 사용)
                    this._allChartData = oData.results;
                    console.log("📦 전체 차트 데이터 저장됨:", this._allChartData);

                    const oJsonModel = new JSONModel({
                        BPSearchsumSet: oData.results
                    });

                    // ⛔ alias 안 줌! 기본 모델로 VizFrame에 바인딩
                    oView.byId("idVizFrame").setModel(oJsonModel);

                    this._loadBpRanking(oData.results); // ✅ BP 순위 계산 호출
                }.bind(this),
                
                error: function () {
                    MessageToast.show("조회 실패!");
                },
                refresh: true // ✅ 꼭 추가
            });
        },

          _loadTableData: function (sYear, sMonth) {  // 하단 테이블 추가: 상세 테이블 로딩 함수
            var oView = this.getView();
            var aFilters = [
                new Filter("Gjahr", FilterOperator.EQ, sYear),
                new Filter("Zmonat", FilterOperator.EQ, sMonth)
            ];

            this._detailModel.read("/BPDetailSet", {
                filters: aFilters,
                success: function (oData) {
                    console.log("📦 세부 데이터:", oData.results); // 
                    console.log("테이블 샘플 데이터:", oData.results[0]);
                    const oDetailModel = new JSONModel({ DetailSet: oData.results });
                    oView.byId("detailTable").setModel(oDetailModel, "detail"); // 
                  // BP명 리스트 추출
            const bpnames = oData.results.map(x => x.BpName).filter(Boolean);
            const uniqueBpnames = Array.from(new Set(bpnames));

            // BP명 드롭다운에 세팅
            var oSelect = oView.byId("detailBpnameSelect");
            oSelect.removeAllItems();
            oSelect.addItem(new sap.ui.core.Item({ key: "ALL", text: "전체" }));
            uniqueBpnames.forEach(bp => {
                oSelect.addItem(new sap.ui.core.Item({ key: bp, text: bp }));
            console.log("드롭다운에 추가된 BP명:", bp);
            });
            oSelect.setSelectedKey("ALL");

            // 필터링 위한 원본 저장
            this._allDetailRows = oData.results;
        }.bind(this),
        error: function () {
            sap.m.MessageToast.show("하단 세부 내역 조회 실패");
        },
        refresh: true
    });
},
        onDetailBpnameChange: function (oEvent) {
    var sKey = oEvent.getSource().getSelectedKey();
    var oView = this.getView();
    var aAll = this._allDetailRows || [];
    var aFiltered = (sKey === "ALL") ? aAll : aAll.filter(x => x.BpName === sKey);

    var oDetailModel = new JSONModel({ DetailSet: aFiltered });
    oView.byId("detailTable").setModel(oDetailModel, "detail");
},
         
          // 중복 BP 제거 및 거래금액 누적 순위 계산 함수
         _loadBpRanking: function (aData) {
            const bpMap = new Map();
            aData.forEach(function (item) {
                const bp = item.Bpname;
                const amount = Number(item.Totaldmbtr);
                if (bpMap.has(bp)) {
                    bpMap.get(bp).Totaldmbtr += amount;
                } else {
                    bpMap.set(bp, {
                        Bpname: bp,
                        Totaldmbtr: amount
                    });
                }
            });

            const sorted = Array.from(bpMap.values()).sort((a, b) => b.Totaldmbtr - a.Totaldmbtr);
            const ranked = sorted.map((item, index) => ({
                Rank: index + 1,
                Bpname: item.Bpname,
                Totaldmbtr: item.Totaldmbtr.toLocaleString()
            }));

            const oRankModel = new JSONModel({ TopBpList: ranked });
            this.getView().setModel(oRankModel, "rank");
        },

onChartClick: function (oEvent) {
     console.log("차트 클릭됨!", oEvent);

    const paramData = oEvent.getParameter("data");
    if (!paramData || !paramData[0] || !paramData[0].data) {
        console.log("차트 데이터 없음 or 이벤트 데이터 없음");
        return;
    }
    const oContext = paramData[0].data;

    // BP명 추출 (차트 Dimension name="BP" 이므로 대문자 "BP")
    const sBpName = oContext["BP"];
    console.log("클릭된 BP명:", sBpName);

    if (!sBpName) {
        console.log("BP명 없음");
        return;
    }

    // BP명으로 _allChartData에서 해당 BP 데이터 찾기 (필드명 Bpname 고정)
    const found = this._allChartData.find(item => item.Bpname === sBpName);

    if (!found) {
        console.log("해당 BP를 데이터에서 찾지 못함", sBpName, this._allChartData.map(x => x.Bpname));
        return;
    }

    // 거래건수, 거래 시작 후 경과일 집계
    const bpItems = this._allChartData.filter(item => item.Bpname === sBpName);
    // 거래 건수
    const totalCount = bpItems.length;

    // 🔵 거래 시작일 계산 (Budat 중 가장 과거)
    // (Budat이 'YYYYMMDD' 문자형태라면 new Date로 변환)
    let firstDate;
    if (bpItems.length > 0) {
        firstDate = new Date(
            bpItems
                .map(i => i.Budat)
                .map(s => s.length === 8 ? `${s.substr(0,4)}-${s.substr(4,2)}-${s.substr(6,2)}` : s)
                .map(s => new Date(s))
                .sort((a, b) => a - b)[0]
        );
    }
    // 오늘 날짜
    const now = new Date();
    // 경과일 계산
    let daysSinceFirstTransaction = "-";
    if (firstDate && !isNaN(firstDate)) {
        const diffMs = now - firstDate;
        daysSinceFirstTransaction = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    }

    // 팝업에 넘길 요약정보
    const oSummary = {
        Bpid: found.Bpid,
        Bpname: sBpName,
        TotalCount: totalCount,
        DaysSinceFirstTransaction: daysSinceFirstTransaction
    };
    const oModel = new JSONModel({ SelectedBP: oSummary });
    this.getView().setModel(oModel, "bpSummary");
    this._openDialog();
},

        _openDialog: function () {
            const oDialog = this.getView().byId("bpSummaryDialog");
            console.log("✅ Dialog 오픈 시도!", oDialog);
            if (oDialog) {
                oDialog.open();
            } else {
                console.log("❌ Dialog를 찾지 못했어요");
            }
        },

        onDialogClose: function () {
            const oDialog = this.getView().byId("bpSummaryDialog");
            if (oDialog) {
                oDialog.close();
            }
        }
    });
});

    
