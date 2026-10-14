import asyncio
from playwright.async_api import async_playwright

async def get_photos_for_url(context, url):
    page = await context.new_page()
    photos = []
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=25000)
        await page.wait_for_timeout(3000)
        
        # Pega a foto principal do cabeçalho da empresa
        hero_imgs = await page.query_selector_all('button[jsaction*="heroHeaderImage"] img, div[jsaction*="heroHeaderImage"] img')
        for h_img in hero_imgs:
            src = await h_img.get_attribute("src") or ""
            if src:
                clean = src.split("=")[0] + "=w800-h600-k-no"
                if clean not in photos:
                    photos.append(clean)

        # Clica no botão de foto do lugar para abrir a galeria oficial
        btn = await page.query_selector('button[aria-label*="Foto" i], button[aria-label*="foto" i], button[jsaction*="pane.heroHeaderImage"]')
        if btn:
            await btn.click()
            await page.wait_for_timeout(3000)
            
            # Rola a galeria para baixo para carregar mais fotos da empresa
            gallery_container = await page.query_selector('div.m6QErb.DxyBCb, div[role="main"], div[tabindex="-1"]')
            if gallery_container:
                for _ in range(3):
                    await page.evaluate('(el) => el.scrollTop = el.scrollHeight', gallery_container)
                    await page.wait_for_timeout(1000)
            
            # Pega as fotos da galeria deste lugar
            imgs = await page.query_selector_all('div[data-photo-index] img, a[data-photo-index] img, img[src*="googleusercontent.com"], img[src*="ggpht.com"]')
            for img in imgs:
                src = await img.get_attribute("src") or ""
                if src and not any(bad in src for bad in ["=s32", "=s36", "=s40", "=s48", "=s64", "avatar"]):
                    clean = src.split("=")[0] + "=w800-h600-k-no"
                    if clean not in photos:
                        photos.append(clean)
    except Exception as e:
        print("Erro:", e)
    finally:
        await page.close()
    return photos[:10]

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(locale="pt-BR")
        
        search_page = await context.new_page()
        await search_page.goto("https://www.google.com/maps/search/pousada+em+Caraguatatuba?hl=pt-BR")
        await search_page.wait_for_timeout(3000)
        
        cards = await search_page.query_selector_all('div.Nv2PK a.hfpxzc')
        items = []
        for c in cards[:2]:
            name = await c.get_attribute("aria-label")
            href = await c.get_attribute("href")
            items.append((name, href))
        await search_page.close()
        
        for name, href in items:
            print(f"\n==========================================")
            print(f"LUGAR: {name}")
            print(f"URL: {href[:90]}")
            photos = await get_photos_for_url(context, href)
            print(f"Total fotos capturadas: {len(photos)}")
            for idx, ph in enumerate(photos):
                print(f"  Foto {idx+1}: {ph}")
                
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
