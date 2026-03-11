const NAVER_CLIENT_ID = '7vUm9Uqx01qm9YRtJ_bX';
const NAVER_CLIENT_SECRET = 'idq86pgv9h';

const datePicker = document.getElementById('datePicker');
const newsContainer = document.getElementById('newsContainer');
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const searchResults = document.getElementById('searchResults');
const bookmarksList = document.getElementById('bookmarksList');
const darkModeToggle = document.getElementById('darkModeToggle');
const clearDataBtn = document.getElementById('clearData');

let currentNews = []; 
let activeCategory = 'all';
let bookmarks = JSON.parse(localStorage.getItem('news_bookmarks') || '[]');
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
    const baseQueries = [`최신 종합 속보`, `뉴스 하이라이트`, `실시간 이슈 뉴스`, `조이시티 소식`];
    let allFetchedItems = [];

    for (let query of baseQueries) {
        const items = await performSearch(query);
        if (items.length > 0) allFetchedItems = [...allFetchedItems, ...items];
        if (allFetchedItems.length > 300) break;
    }

    let uniqueItems = Array.from(new Set(allFetchedItems.map(a => a.link))).map(link => allFetchedItems.find(a => a.link === link));
    let initialFiltered = uniqueItems.filter(item => getLocalDateStr(item.pubDate) === selectedDate);
    processNewsItems(initialFiltered);

    for (let cat of categories) {
        let counts = getCategoryCounts();
        if ((counts[cat] || 0) < 10) {
            const searchTerms = [`${getCategoryName(cat)} ${selectedDate.replace(/-/g, '.')}`, `${getCategoryName(cat)} 속보`];
            for (let t of searchTerms) {
                const catItems = await performSearch(t);
                const catFiltered = catItems.filter(item => getLocalDateStr(item.pubDate) === selectedDate);
                processNewsItems(catFiltered, cat);
                if (getCategoryCounts()[cat] >= 10) break;
            }
        }
    }

    if (currentNews.length === 0) {
        useMockData(selectedDate, "해당 날짜의 실시간 소식이 없습니다. 주요 분야별 브리핑을 전해드립니다.");
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
    const cleanTitle = (title) => {
        return title.replace(/<[^>]*>?/gm, '') // Remove HTML tags
                    .replace(/\[[^\]]*\]/g, '') // Remove ALL bracketed content like [속보], [단독]
                    .replace(/\([^)]*\)/g, '') // Remove ALL parenthetical content like (종합), (1보)
                    .replace(/[^\w\sㄱ-ㅎ가-힣]/g, '') // Remove special characters
                    .replace(/\s+/g, ' ') // Collapse multiple spaces
                    .trim()
                    .toLowerCase();
    };

    const getSimilarity = (s1, s2) => {
        if (s1 === s2) return 1.0;
        const len1 = s1.length;
        const len2 = s2.length;
        if (len1 === 0 || len2 === 0) return 0.0;

        const matrix = Array.from({ length: len1 + 1 }, () => new Array(len2 + 1).fill(0));
        for (let i = 0; i <= len1; i++) matrix[i][0] = i;
        for (let j = 0; j <= len2; j++) matrix[0][j] = j;

        for (let i = 1; i <= len1; i++) {
            for (let j = 1; j <= len2; j++) {
                const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
                matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
            }
        }
        return 1.0 - matrix[len1][len2] / Math.max(len1, len2);
    };

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
        return { ...item, assignedCategory, isBackup: false, cleanedTitle: cleanTitle(item.title) };
    });

    const SIMILARITY_THRESHOLD = 0.7;

    newProcessed.forEach(item => {
        const isDuplicate = currentNews.some(existing => {
            if (existing.link === item.link) return true;
            if (getSimilarity(existing.cleanedTitle, item.cleanedTitle) >= SIMILARITY_THRESHOLD) return true;
            return false;
        });

        if (!isDuplicate) {
            currentNews.push(item);
        }
    });
}

function getCategoryCounts() {
    return currentNews.reduce((acc, i) => { acc[i.assignedCategory] = (acc[i.assignedCategory] || 0) + 1; return acc; }, {});
}

function renderNews(targetContainer = newsContainer, data = currentNews, isSearch = false) {
    targetContainer.innerHTML = '';
    let filtered = data;
    if (!isSearch) {
        filtered = activeCategory === 'all' ? data : data.filter(i => i.assignedCategory === activeCategory);
        filtered.sort((a, b) => {
            const aJoy = (a.title + a.description).includes('조이시티') ? 1 : 0;
            const bJoy = (b.title + b.description).includes('조이시티') ? 1 : 0;
            if (aJoy !== bJoy) return bJoy - aJoy;
            return new Date(b.pubDate) - new Date(a.pubDate);
        });
    }

    const decode = (str) => {
        const txt = document.createElement('textarea');
        txt.innerHTML = str || '';
        const cleaned = txt.value.replace(/<[^>]*>?/gm, '').trim();
        const fxt = document.createElement('textarea');
        fxt.innerHTML = cleaned;
        return fxt.value;
    };

    filtered.forEach((item) => {
        const card = document.createElement('article');
        card.className = 'news-card';
        if (item.title.includes('조이시티')) card.classList.add('highlight-joycity');
        
        const link = item.originallink || item.link || '#';
        const formattedDate = new Date(item.pubDate).toLocaleDateString('ko-KR');
        const isBookmarked = bookmarks.some(b => b.link === item.link);
        
        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <div class="category cat-${item.assignedCategory}">${getCategoryName(item.assignedCategory)}</div>
                <button class="bookmark-btn" style="background:none; border:none; font-size: 18px; cursor:pointer;">
                    ${isBookmarked ? '🔖' : '📑'}
                </button>
            </div>
            <h3><a href="${link}" target="_blank" class="title-link">${decode(item.title)}</a></h3>
            <p class="news-content">${decode(item.description)}</p>
            <div class="news-footer">
                <a href="${link}" target="_blank" class="source">본문 보기</a>
                <span class="date-badge">${formattedDate}</span>
            </div>
        `;

        card.querySelector('.bookmark-btn').addEventListener('click', (e) => {
            e.preventDefault();
            toggleBookmark(item);
            renderNews(targetContainer, data, isSearch);
            if (activeCategory === 'bookmarks') renderBookmarks();
        });

        targetContainer.appendChild(card);
    });
}

// 탭 전환 로직
document.querySelectorAll('.tab-item').forEach(tab => {
    tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById(`${tabName}Section`).classList.add('active');

        // 홈 탭이 아닐 경우 카테고리 바 숨기기
        const categoryBar = document.querySelector('.category-scroll-wrapper');
        categoryBar.style.display = tabName === 'home' ? 'block' : 'none';

        if (tabName === 'bookmarks') renderBookmarks();
    });
});

// 카테고리 필터 로직
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeCategory = btn.dataset.category;
        renderNews();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
});

// 검색 기능
searchBtn.addEventListener('click', async () => {
    const query = searchInput.value.trim();
    if (!query) return;
    searchResults.innerHTML = '<div class="loader">검색 기사를 불러오는 중...</div>';
    const items = await performSearch(query);
    if (items.length === 0) {
        searchResults.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--ios-grey);">검색 결과가 없습니다.</div>';
    } else {
        const processed = items.map(i => ({ ...i, assignedCategory: 'society' }));
        renderNews(searchResults, processed, true);
    }
});

searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') searchBtn.click();
});

// 북마크 기능
function toggleBookmark(item) {
    const index = bookmarks.findIndex(b => b.link === item.link);
    if (index === -1) {
        bookmarks.push(item);
    } else {
        bookmarks.splice(index, 1);
    }
    localStorage.setItem('news_bookmarks', JSON.stringify(bookmarks));
}

function renderBookmarks() {
    if (bookmarks.length === 0) {
        bookmarksList.innerHTML = '<div style="text-align:center; padding: 60px; color: var(--ios-grey);">저장된 기사가 없습니다. 마음에 드는 기사의 📑 아이콘을 눌러보세요.</div>';
    } else {
        renderNews(bookmarksList, bookmarks, true);
    }
}

// 설정 기능
darkModeToggle.addEventListener('change', () => {
    document.body.classList.toggle('dark-mode', darkModeToggle.checked);
    localStorage.setItem('news_dark_mode', darkModeToggle.checked);
});

clearDataBtn.addEventListener('click', () => {
    if (confirm('모든 북마크와 설정 데이터를 초기화할까요?')) {
        localStorage.clear();
        location.reload();
    }
});

function initSettings() {
    const isDark = localStorage.getItem('news_dark_mode') === 'true';
    darkModeToggle.checked = isDark;
    if (isDark) document.body.classList.add('dark-mode');
}

function showLoading() {
    newsContainer.innerHTML = `<div class="loader">뉴스를 정밀 동기화 중...</div>`;
}

function getCategoryName(cat) {
    const names = { politics: '정치', economy: '경제', stock: '증권/주식', it: 'IT/과학', society: '사회', world: '국제', sports: '스포츠' };
    return names[cat] || '기타';
}

function useMockData(selectedDate, msg) {
    currentNews = [];
    const industries = [
        { cat: 'politics', title: "국회, 민생법안 처리를 위한 여야 협력 강화 합의", desc: "민생 경제 회복을 최우선 과제로 삼고 여야가 주요 법안 처리에 속도를 내기로 합의했습니다.", link: "https://news.naver.com/" },
        { cat: 'economy', title: "국내 기업들, 글로벌 시장 점유율 지속 확대 성과", desc: "기술력과 품질을 앞세운 우리 기업들이 세계 시장에서 괄목할 만한 성장을 거두며 활력을 불어넣고 있습니다.", link: "https://news.naver.com/" },
        { cat: 'stock', title: "[특징주] 조이시티, 차세대 전략 게임 글로벌 시장 안착 기대감", desc: "조이시티의 탄탄한 신작 라인업과 글로벌 서비스 역량이 시장의 주목을 받으며 투자 심리를 자극하고 있습니다.", link: "https://news.naver.com/" },
        { cat: 'it', title: "K-인공지능(AI) 기술 혁신: 글로벌 테크 시장의 새로운 주역", desc: "대한민국 IT 기업들이 독자적인 AI 기술 개발과 상용화에 성공하며 전 세계 테크 산업의 흐름을 주도하고 있습니다.", link: "https://news.naver.com/" },
        { cat: 'world', title: "국제 사회, 에너지 공급망 다변화 및 환경 보호 공조 강화", desc: "주요 국가들이 지속 가능한 미래를 위해 에너지 안보 체계를 구축하고 기후 위기 대응을 위한 전략적 파트너십을 맺고 있습니다.", link: "https://news.naver.com/" },
        { cat: 'sports', title: "대한민국 태극전사들, 유럽 무대서 '골 폭풍' 연일 승전보", desc: "유럽 명문 구단에서 활약하는 우리 선수들이 최고의 기량을 선보이며 전 세계 축구 팬들의 찬사를 받고 있습니다.", link: "https://news.naver.com/" }
    ];

    industries.forEach((art, idx) => {
        currentNews.push({
            title: art.title,
            description: art.desc,
            pubDate: selectedDate,
            assignedCategory: art.cat,
            originallink: art.link,
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
    notice.style.cssText = `grid-column: 1/-1; text-align: center; color: ${isPink ? '#f472b6' : '#007AFF'}; padding: 1rem; background: ${isPink ? 'rgba(244,114,182,0.1)' : 'rgba(0,122,255,0.08)'}; border-radius: 12px; margin-bottom: 1rem; border: 0.5px solid ${isPink ? 'rgba(244,114,182,0.3)' : 'rgba(0,122,255,0.2)'}; font-size: 13px;`;
    notice.innerHTML = `<span>${msg}</span>`;
    newsContainer.prepend(notice);
}

datePicker.addEventListener('change', (e) => fetchNews(e.target.value));

window.onload = () => {
    initSettings();
    const today = new Date().toLocaleDateString('en-CA');
    datePicker.value = today;
    fetchNews(today);
};
