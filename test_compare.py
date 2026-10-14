import asyncio
from playwright.async_api import async_playwright

async def get_place_photos(name_query):
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        url = f'https://www.google.com/maps/search/{name_query.replace(" ", "+")}?hl=pt-BR'
        await page.goto(url, wait_until='domcontentloaded')
        await page.wait_for_timeout(3000)
        
        first_link = await page.query_selector('a.hfpxzc')
        if first_link:
            await first_link.click()
            await page.wait_for_timeout(3500)
            
            photo_btn = await page.query_selector('button[aria-label*="Foto" i], button[aria-label*="foto" i], button[jsaction*="heroHeaderImage"]')
            if photo_btn:
                await photo_btn.click()
                await page.wait_for_timeout(3500)
                
                imgs = await page.evaluate("""() => {
                    const set = new Set();
                    document.querySelectorAll('img').forEach(el => {
                        const s = el.src || '';
                        if ((s.includes('googleusercontent.com') || s.includes('ggpht.com')) && !s.includes('=s32') && !s.includes('=s36') && !s.includes('=s40')) {
                            set.add(s.split('=')[0]);
                        }
                    });
                    return Array.from(set);
                }""")
                await browser.close()
                return imgs[:5]
        await browser.close()
        return []

async def main():
    p1 = await get_place_photos("Pousada Primavera Caraguatatuba")
    print("--- Pousada Primavera ---")
    for s in p1:
        print(s[:80])
        
    p2 = await get_place_photos("Hotel Pousada Vivendas do Sol e Mar Caraguatatuba")
    print("--- Vivendas do Sol e Mar ---")
    for s in p2:
        print(s[:80])

if __name__ == "__main__":
    asyncio.run(main())
