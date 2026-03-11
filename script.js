const NAVER_CLIENT_ID = '7vUm9Uqx01qm9YRtJ_bX';
const NAVER_CLIENT_SECRET = 'idq86pgv9h';

const datePicker = document.getElementById('datePicker');
const newsContainer = document.getElementById('newsContainer');

let currentNews = []; 
let activeCategory = 'all';
const categories = ['politics', 'economy', 'stock', 'it', 'society', 'world', 'sports'];

const categoryKeywords = {
    politics: ['정치', '대통령', '국회', '선거', '의원', '총선', '대선', '북한', '외교', '장관', '정당', '정부', '내각', '청와대', '여당', '야당', '법안'],
    economy: ['경제', '환율', '금리', '물가', '기업', '수출', '무역', '고용', '금융', '시장', '금감원', '한국은행', '재정', '무역수지', '인플레이션', '성장률'],
    stock: ['주식', '주가', '증권', '코스피', '코스닥', '상장', '배당', '나스닥', '개미', '외인', '기관', '매수', '매도', '조이시티'],
    it: ['it', '기술', '반도체', 'ai', '인공지능', '스마트폰', '플랫폼', '구글', '네이버', '카카오', '우주', '로봇', '메타버스', '게임', '소프트웨어', '과학', '삼성전자', '애플', '챗gpt', 'openai', '엔비디아', '테슬라', '전기차', '자율주행', '스타트업', '유니콘'],
    society: ['사회', '사건', '사고', '경찰', '검찰', '날씨', '교육', '의료', '노동', '복지', '환경', '기상청', '행정', '지자체'],
    world: ['국제', '미국', '중국', '일본', '유럽', '우크라이나', '중동', '러시아', '전쟁', '백악관', '바이든', '트럼프', '푸틴', '해외', '이스라엘', '가자', '영국', '프랑스', '독일', '기시다', '시진핑', '젤렌스키'],
    sports: ['스포츠', '야구', '축구', '배구', '농구', '올림픽', '월드컵', '골프', '테니스', 'kbo', 'epl', '프리미어리그', '손흥민', '김민재', '이강인', '메이저리그', 'mlb', '한화이글스', '기아타이거즈', '토트넘', '리그1', '분데스리가', '황희찬']
};

// 로컬 날짜(KST) 기준 YYYY-MM-DD 문자열을 반환하는 헬퍼 함수
function getLocalDateStr(dateInput) {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return "";
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

async function fetchNews(selectedDate) {
    showLoading();
    currentNews = [];
    
    // 1단계: 통합 실시간 속보 수집 (더 넓게 검색)
    const baseQueries = [`최신 종합 속보`, `뉴스 하이라이트`, `실시간 이슈 뉴스`, `분야별 주요 기사`, `조이시티 소식`];
    let allFetchedItems = [];

    for (let query of baseQueries) {
        const items = await performSearch(query);
        if (items.length > 0) allFetchedItems = [...allFetchedItems, ...items];
        if (allFetchedItems.length > 300) break;
    }

    let uniqueItems = Array.from(new Set(allFetchedItems.map(a => a.link))).map(link => allFetchedItems.find(a => a.link === link));
    let initialFiltered = uniqueItems.filter(item => getLocalDateStr(item.pubDate) === selectedDate);
    
    processNewsItems(initialFiltered);

    // 2단계: 카테고리별 부족분 강력 보충 (타겟 수집 대폭 강화)
    for (let cat of categories) {
        let counts = getCategoryCounts();
        if ((counts[cat] || 0) < 10) { // 목표 수량 10개로 상향
            const searchTerms = [
                `${getCategoryName(cat)} ${selectedDate.replace(/-/g, '.')}`,
                `${getCategoryName(cat)} 최신 뉴스`,
                `${getCategoryName(cat)} 실시간 속보`
            ];

            for (let t of searchTerms) {
                const catItems = await performSearch(t);
                const catFiltered = catItems.filter(item => getLocalDateStr(item.pubDate) === selectedDate);
                processNewsItems(catFiltered, cat);
                
                // 해당 카테고리가 10개를 넘으면 추가 검색 중단
                if (getCategoryCounts()[cat] >= 10) break;
            }
        }
    }

    // 3단계: 최종적으로도 데이터가 전혀 없으면 백업 모드
    if (currentNews.length === 0) {
        useMockData(selectedDate, "해당 날짜의 실시간 소식이 일시적으로 연결되지 않습니다. 주요 카테고리별 소식을 대신 제공합니다.");
        return;
    }

    renderNews();
}

async function performSearch(query) {
    const targetUrl = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=100&sort=date`;
    const proxies = ["https://corsproxy.io/?", "https://thingproxy.freeboard.io/fetch/", "https://api.allorigins.win/get?url="];

    for (let proxy of proxies) {
        try {
            const isAllOrigins = proxy.includes('allorigins');
            const fullUrl = isAllOrigins ? proxy + encodeURIComponent(targetUrl) : proxy + targetUrl;
            const res = await fetch(fullUrl, {
                headers: isAllOrigins ? {} : { 'X-Naver-Client-Id': NAVER_CLIENT_ID, 'X-Naver-Client-Secret': NAVER_CLIENT_SECRET }
            });
            if (!res.ok) continue;
            const data = isAllOrigins ? JSON.parse((await res.json()).contents) : await res.json();
            return data.items || [];
        } catch (e) { console.error(e); }
    }
    return [];
}

function processNewsItems(items, forcedCategory = null) {
    const newProcessed = items.map(item => {
        let assignedCategory = forcedCategory;
        if (!assignedCategory) {
            const fullText = (item.title + item.description).toLowerCase();
            for (const [cat, keywords] of Object.entries(categoryKeywords)) {
                if (keywords.some(k => fullText.includes(k.toLowerCase()))) {
                    assignedCategory = cat;
                    break;
                }
            }
        }
        if (!assignedCategory) assignedCategory = 'society';
        return { ...item, assignedCategory, isBackup: false };
    });

    const existingLinks = new Set(currentNews.map(n => n.link));
    newProcessed.forEach(item => {
        if (!existingLinks.has(item.link)) currentNews.push(item);
    });
}

function getCategoryCounts() {
    return currentNews.reduce((acc, i) => { acc[i.assignedCategory] = (acc[i.assignedCategory] || 0) + 1; return acc; }, {});
}

function useMockData(selectedDate, msg) {
    currentNews = [];
    const industries = [
        { cat: 'politics', title: "국회, 민생법안 처리를 위한 여야 협력 강화 합의", desc: "국민들의 실생활에 직접적인 도움을 줄 수 있는 주요 현안들을 우선적으로 처리하기 위해 정치권이 힘을 모으고 있습니다." },
        { cat: 'economy', title: "국내 수출 업계, 글로벌 시장 점유율 지속 확대 성과", desc: "대한민국 기업들이 우수한 기술력을 바탕으로 해외 시장에서 괄목할 만한 성장을 거두며 경제 활력을 불어넣고 있습니다." },
        { cat: 'stock', title: "[특징주] 조이시티, 차세대 전략 게임 글로벌 시장 안착 기대감", desc: "조이시티의 탄탄한 신작 라인업과 글로벌 서비스 역량이 시장의 주목을 받으며 투자 심리를 자극하고 있습니다." },
        { cat: 'it', title: "K-인공지능(AI) 기술 혁신: 글로벌 테크 시장의 새로운 주역", desc: "대한민국 IT 기업들이 독자적인 AI 기술 개발과 상용화에 성공하며 전 세계 테크 산업의 흐름을 주도하고 있습니다." },
        { cat: 'it', title: "삼성전자, 차세대 반도체 공격적 투자로 초격차 유지", desc: "글로벌 시장의 불확실성 속에서도 반도체 분야의 압도적인 기술 우위를 점하기 위한 대규모 투자가 이어지고 있습니다." },
        { cat: 'it', title: "애플, 새로운 하이브리드 워크 스테이션 공개 예정", desc: "성능과 휴대성을 동시에 잡은 차세대 기기 출시 소식에 전 세계 테크 매니아들의 관심이 집중되고 있습니다." },
        { cat: 'society', title: "봄철 나들이 인파 증가: 지자체별 풍성한 지역 축제 개최", desc: "따뜻한 날씨와 함께 전국 각지에서 특색 있는 꽃축제 등 다양한 행사들이 열리며 시민들에게 즐거움을 선사하고 있습니다." },
        { cat: 'world', title: "국제 사회, 에너지 공급망 다변화 및 환경 보호 공조 강화", desc: "주요 국가들이 지속 가능한 미래를 위해 에너지 안보 체계를 구축하고 기후 위기 대응을 위한 전략적 파트너십을 맺고 있습니다." },
        { cat: 'sports', title: "대한민국 태극전사들, 유럽 무대서 '골 폭풍' 연일 승전보", desc: "유럽 명문 구단에서 활약하는 우리 선수들이 최고의 기량을 선보이며 전 세계 축구 팬들의 찬사를 받고 있습니다." }
    ];

    industries.forEach((art, idx) => {
        currentNews.push({
            title: art.title,
            description: art.desc,
            pubDate: selectedDate,
            assignedCategory: art.cat,
            originallink: "https://news.naver.com/",
            link: `https://news.naver.com/mock-${idx}`,
            isBackup: true
        });
    });

    renderNews();
    showStatusNotice(msg, true);
}

function showStatusNotice(msg, isPink) {
    if (document.getElementById('statusNotice')) document.getElementById('statusNotice').remove();
    const notice = document.createElement('div');
    notice.id = 'statusNotice';
    notice.style.cssText = `grid-column: 1/-1; text-align: center; color: ${isPink ? '#f472b6' : '#007AFF'}; padding: 1.5rem; background: ${isPink ? 'rgba(244,114,182,0.1)' : 'rgba(0,122,255,0.08)'}; border-radius: 12px; margin-top: 1rem; margin-bottom: 1rem; border: 0.5px solid ${isPink ? 'rgba(244,114,182,0.3)' : 'rgba(0,122,255,0.2)'}; font-size: 0.8rem;`;
    notice.innerHTML = `<span>${msg}</span>`;
    newsContainer.appendChild(notice);
}

function renderNews() {
    newsContainer.innerHTML = '';
    const filtered = activeCategory === 'all' ? currentNews : currentNews.filter(i => i.assignedCategory === activeCategory);

    filtered.sort((a, b) => {
        const aJoy = (a.title + a.description).includes('조이시티') ? 1 : 0;
        const bJoy = (b.title + b.description).includes('조이시티') ? 1 : 0;
        if (aJoy !== bJoy) return bJoy - aJoy;
        return new Date(b.pubDate) - new Date(a.pubDate);
    });

    const decode = (str) => {
        const txt = document.createElement('textarea');
        txt.innerHTML = str || '';
        const cleaned = txt.value.replace(/<[^>]*>?/gm, '').trim();
        const fxt = document.createElement('textarea');
        fxt.innerHTML = cleaned;
        return fxt.value;
    };

    filtered.forEach((item, index) => {
        const card = document.createElement('article');
        card.className = 'news-card';
        if (item.title.includes('조이시티')) card.classList.add('highlight-joycity');
        
        const link = item.originallink || item.link || '#';
        const formattedDate = new Date(item.pubDate).toLocaleDateString('ko-KR');
        
        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <div class="category cat-${item.assignedCategory}">${getCategoryName(item.assignedCategory)}</div>
                <div style="font-size: 10px; font-weight: 800; padding: 2px 6px; border-radius: 4px; background: ${item.isBackup ? 'rgba(255,45,85,0.1)' : 'rgba(52,199,89,0.1)'}; color: ${item.isBackup ? '#FF2D55' : '#34C759'};">
                    ${item.isBackup ? 'BACKUP' : 'LIVE'}
                </div>
            </div>
            <h3><a href="${link}" target="_blank" class="title-link">${decode(item.title)}</a></h3>
            <p class="news-content">${decode(item.description)}</p>
            <div class="news-footer">
                <a href="${link}" target="_blank" class="source">기사 본문 읽기</a>
                <span class="date-badge">${formattedDate}</span>
            </div>
        `;
        newsContainer.appendChild(card);
    });
}

// iOS Tab Bar 및 필터 로직
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeCategory = btn.dataset.category;
        renderNews();
        // 모발 터치 피드백
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
});

document.querySelectorAll('.tab-item').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const tabName = tab.dataset.tab;
        
        if (tabName === 'home') {
            activeCategory = 'all';
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            document.querySelector('.filter-btn[data-category="all"]').classList.add('active');
            renderNews();
        } else if (tabName === 'search') {
            alert('검색 기능은 준비 중입니다.');
        } else if (tabName === 'bookmarks') {
            alert('북마크 기능은 준비 중입니다.');
        } else if (tabName === 'settings') {
            alert('설정 메뉴입니다. 다크모드 및 알림 설정을 지원할 예정입니다.');
        }
    });
});

function showLoading() {
    newsContainer.innerHTML = `<div class="loader">로컬 날짜(KST) 기준으로 정밀 동기화 중...</div>`;
}

function getCategoryName(cat) {
    const names = { politics: '정치', economy: '경제', stock: '증권/주식', it: 'IT/과학', society: '사회', world: '국제', sports: '스포츠' };
    return names[cat] || '기타';
}

datePicker.addEventListener('change', (e) => fetchNews(e.target.value));

window.onload = () => {
    const today = new Date().toLocaleDateString('en-CA');
    datePicker.value = today;
    fetchNews(today);
};
