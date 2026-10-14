import asyncio
from playwright.async_api import async_playwright

async def inspect_place():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        # URL da Pousada Villa del Mare
        url = "https://www.google.com/maps/place/Pousada+Villa+del+Mare"
        await page.goto(url, wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(3000)
        
        print("URL final:", page.url)
        
        # Inspeciona todos os botões e links que têm 'foto' ou 'photo'
        elements = await page.evaluate("""() => {
            const list = [];
            document.querySelectorAll('button, a').forEach(el => {
                const label = el.getAttribute('aria-label') || '';
                const text = el.innerText || '';
                const href = el.getAttribute('href') || '';
                const jsaction = el.getAttribute('jsaction') || '';
                if (label.toLowerCase().includes('foto') || label.toLowerCase().includes('photo') || text.toLowerCase().includes('foto') || jsaction.includes('heroHeaderImage')) {
                    list.push({
                        tag: el.tagName,
                        label: label,
                        text: text.trim().substring(0, 40),
                        href: href.substring(0, 60),
                        jsaction: jsaction
                    });
                }
            });
            return list;
        }""")
        
        print(f"Botoes/links de foto encontrados: {len(elements)}")
        for e in elements:
            print(e)
            
        await browser.close()

if __name__ == "__main__":
    asyncio.run(inspect_place())
