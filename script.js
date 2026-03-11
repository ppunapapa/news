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
    it: ['it', '기술', '반도체', 'ai', '인공지능', '스마트폰', '플랫폼', '구글', '네이버', '카카오', '우주', '로봇', '메타버스', '게임', '소프트웨어', '과학'],
    society: ['사회', '사건', '사고', '경찰', '검찰', '날씨', '교육', '의료', '노동', '복지', '환경', '기상청', '행정', '지자체'],
    world: ['국제', '미국', '중국', '일본', '유럽', '우크라이나', '중동', '러시아', '전쟁', '백악관', '바이든', '트럼프', '푸틴', '해외', '이스라엘', '가자'],
    sports: ['스포츠', '야구', '축구', '배구', '농구', '올림픽', '월드컵', '골프', '테니스', 'kbo', 'epl', '프리미어리그', '손흥민', '김민재', '이강인', '메이저리그', 'mlb', '한화이글스', '기아타이거즈']
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
    
    const baseQueries = [`실시간 속보 뉴스`, `최신 주요 뉴스`, `종합 속보`, `뉴스 하이라이트`, `조이시티 주요뉴스`];
    const categoryQueries = categories.map(cat => `${getCategoryName(cat)} 최신 속보`);
    const allQueries = [...baseQueries, ...categoryQueries];

    let allFetchedItems = [];

    for (let query of allQueries) {
        const items = await performSearch(query);
        if (items.length > 0) allFetchedItems = [...allFetchedItems, ...items];
        if (allFetchedItems.length > 250) break;
    }

    let uniqueItems = Array.from(new Set(allFetchedItems.map(a => a.link))).map(link => allFetchedItems.find(a => a.link === link));
    let filtered = uniqueItems.filter(item => getLocalDateStr(item.pubDate) === selectedDate);

    if (filtered.length < 15) {
        for (let cat of categories) {
            const catSpecificQuery = `${getCategoryName(cat)} ${selectedDate.replace(/-/g, '.')}`;
            const catItems = await performSearch(catSpecificQuery);
            const catFiltered = catItems.filter(item => getLocalDateStr(item.pubDate) === selectedDate);
            filtered = [...filtered, ...catFiltered];
            filtered = Array.from(new Set(filtered.map(a => a.link))).map(link => filtered.find(a => a.link === link));
            if (filtered.length > 60) break;
        }
    }

    if (filtered.length === 0) {
        useMockData(selectedDate, "해당 날짜의 실시간 소식이 없습니다. 주요 고정 소식을 대신 전해드립니다.");
        return;
    }

    processNewsItems(filtered);
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
    const mockArticles = [
        { cat: 'politics', title: "정부, 민생 경제 지원 법안 속전속결 처리 합의", desc: "민생 안정과 기업 투자 활성화를 위한 법안들이 조속히 시행될 수 있도록 여야가 협력하기로 했습니다.", link: "https://news.naver.com/main/main.naver?mode=LSD&mid=shm&sid1=100" },
        { cat: 'economy', title: "글로벌 수출 호조세 지속: 한국 경제의 든든한 버팀목", desc: "주력 수출 품목의 세계 시장 점유율이 확대되면서 경제 성장률 전망치도 상향 조정되고 있습니다.", link: "https://news.naver.com/main/main.naver?mode=LSD&mid=shm&sid1=101" },
        { cat: 'stock', title: "[특징주] 조이시티, 차세대 전략 게임 대규모 업데이트 기대감에 강세", desc: "기존 IP의 강력한 경쟁력과 더불어 조이시티의 신작 소식이 더해지며 주가 상승 동력이 확보되고 있습니다.", link: "https://news.naver.com/main/main.naver?mode=LSD&mid=shm&sid1=101" },
        { cat: 'it', title: "K-인공지능(AI) 글로벌 경쟁력 강화: 초거대 언어로봇 상용화", desc: "국내 테크 기업들이 독자적인 플랫폼 기술을 바탕으로 글로벌 시장 선점에 박차를 가하고 있습니다.", link: "https://news.naver.com/main/main.naver?mode=LSD&mid=shm&sid1=105" },
        { cat: 'sports', title: "한국 스포츠 스타들, 세계 무대서 연일 낭보", desc: "전 세계 곳곳에서 활약 중인 우리 선수들이 최고의 기량을 선보이며 국위를 선양하고 있습니다.", link: "https://sports.news.naver.com/index" }
    ];

    mockArticles.forEach(art => {
        currentNews.push({
            title: art.title,
            description: art.desc,
            pubDate: selectedDate,
            assignedCategory: art.cat,
            originallink: art.link,
            link: art.link,
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
        // 모바일 터치 피드백
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
