import asyncio
from playwright.async_api import async_playwright

async def inspect():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        url = 'https://www.google.com/maps/search/Pousada+Porto+do+Rio+Caraguatatuba?hl=pt-BR'
        await page.goto(url, wait_until='domcontentloaded')
        await page.wait_for_timeout(3000)
        
        # Clica no link do primeiro resultado
        first_link = await page.query_selector('a.hfpxzc')
        if first_link:
            name = await first_link.get_attribute("aria-label")
            print("Clicando no estabelecimento:", name)
            await first_link.click()
            await page.wait_for_timeout(3500)
            print("URL apos clique:", page.url)

            # Inspeciona os botões com fotos
            photo_buttons = await page.query_selector_all('button[aria-label*="Foto" i], button[aria-label*="foto" i], button[jsaction*="heroHeaderImage"]')
            print(f"Botoes de foto encontrados: {len(photo_buttons)}")
            for btn in photo_buttons:
                txt = await btn.get_attribute("aria-label") or await btn.inner_text()
                print("Botao:", txt[:60])

            # Clica no botao de fotos para abrir a galeria oficial
            if photo_buttons:
                print("Clicando no botao de foto para abrir a galeria...")
                await photo_buttons[0].click()
                await page.wait_for_timeout(3500)
                print("URL da galeria:", page.url)
                
                # Inspeciona as fotos dentro da galeria
                imgs = await page.evaluate("""() => {
                    const res = [];
                    // Na galeria do Google Maps, as fotos ficam em div[role="feed"] ou em a[data-photo-index] ou background-image
                    const elements = document.querySelectorAll('div[data-photo-index], a[data-photo-index], img[src*="googleusercontent.com"], div[style*="googleusercontent.com"]');
                    elements.forEach(el => {
                        let src = '';
                        if (el.tagName === 'IMG') {
                            src = el.src;
                        } else if (el.style && el.style.backgroundImage) {
                            src = el.style.backgroundImage;
                        } else {
                            const subImg = el.querySelector('img');
                            if (subImg) src = subImg.src;
                        }
                        if (src) res.push(src);
                    });
                    return res;
                }""")
                print(f"Fotos encontradas na galeria: {len(imgs)}")
                for i, s in enumerate(imgs[:10]):
                    print(f"Foto [{i}]: {s[:90]}")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(inspect())
