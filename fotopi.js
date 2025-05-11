const express = require('express');
const { chromium } = require('playwright');
const fs = require('fs');
const { PNG } = require('pngjs');
const base64 = require('base64-js');
const app = express();


const extrairDados = async (page) => {
    const dados = {};
    const campos = {
        "Posto de Entrega": "input[id='form:serviceStationPrint']",
        "Registro Geral": "input[id='form:overralRecord']",
        "R.G anterior": "input[id='form:previousOverralRecord']",
        "Protocolo": "input[id='form:protocol']",
        "CPF": "input[id='form:cpf']",
        "Nome Completo": "input[id='form:name']",
        "Filiação 01": "input[id='form:mother']",
        "Filiação 02": "input[id='form:father']",
        "Data de Nascimento": "input[id='form:dateBirth_input']"
    };

    for (const [campo, seletor] of Object.entries(campos)) {
        try {
            dados[campo] = await page.inputValue(seletor);
        } catch {
            dados[campo] = "";
        }
    }

    return dados;
};

const extrairFoto = (caminhoScreenshot) => {
    try {
        const imagem = PNG.sync.read(fs.readFileSync(caminhoScreenshot));
        const largura = imagem.width;
        const altura = imagem.height;
        const larguraCorte = 140;
        const alturaCorte = 175;
        const esquerda = largura - larguraCorte - 130;
        const topo = 90;
        const direita = esquerda + larguraCorte;
        const fundo = topo + alturaCorte;

        const fotoCortada = new PNG({ width: larguraCorte, height: alturaCorte });
        PNG.bitblt(imagem, fotoCortada, esquerda, topo, larguraCorte, alturaCorte, 0, 0);

        const caminhoFoto = "foto_extraida_cortada.png";
        fs.writeFileSync(caminhoFoto, PNG.sync.write(fotoCortada));

        const fotoBase64 = base64.fromByteArray(fs.readFileSync(caminhoFoto));
        fs.unlinkSync(caminhoFoto);
        return fotoBase64;
    } catch (erro) {
        console.log("Erro ao extrair a foto:", erro);
        return null;
    }
};

const consultarIbioseg = async (cpf) => {
    const navegador = await chromium.launch({ headless: false });
    const contexto = await navegador.newContext();
    const pagina = await contexto.newPage();
    try {
        await pagina.goto("https://ibioseg.pi.gov.br/login.xhtml", { timeout: 120000 });
        await pagina.waitForSelector("input[name='username']", { timeout: 10000 });
        await pagina.fill("input[name='username']", "rayana.silva");
        await pagina.fill("input[name='password']", "123456");
        await pagina.click("button[type='submit']");
        await pagina.waitForLoadState("networkidle");
        await pagina.goto("https://ibioseg.pi.gov.br/views/civilIdentification/FindCivilIdentification.xhtml");
        await pagina.click("text=Consultar");
        await pagina.fill("input[id='form:cpf']", cpf);
        await pagina.evaluate("if(typeof search === 'function') { search(''); }");
        await pagina.waitForLoadState("networkidle");
        await new Promise(resolve => setTimeout(resolve, 500));
        await pagina.click("#form\\:datatable\\:0\\:j_idt97");
        await pagina.waitForLoadState("networkidle");
        await new Promise(resolve => setTimeout(resolve, 500));
        const dados = await extrairDados(pagina);
        await pagina.click("span.ui-button-text.ui-c:has-text('Voltar')");
        await pagina.waitForLoadState("networkidle");
        await new Promise(resolve => setTimeout(resolve, 500));
        await pagina.fill("input[id='form:cpf']", cpf);
        await pagina.evaluate("if(typeof search === 'function') { search(''); }");
        await pagina.waitForLoadState("networkidle");
        const [popup] = await Promise.all([
            pagina.waitForEvent('popup'),
            pagina.click("button[title='Prontuário']")
        ]);
        await popup.waitForLoadState("networkidle");
        await new Promise(resolve => setTimeout(resolve, 4000));
        const caminhoScreenshot = "prontuario_popup.png";
        await popup.screenshot({ path: caminhoScreenshot, fullPage: true, timeout: 180000 }); 
        const fotoBase64 = extrairFoto(caminhoScreenshot);
        fs.unlinkSync(caminhoScreenshot);
        await contexto.close();
        await navegador.close();
        return { dados, foto_base64: fotoBase64 };
    } catch (error) {
        console.error("Erro durante a execução:", error);
        await contexto.close();
        await navegador.close();
        return { error: "Erro ao consultar o CPF. Tente novamente." };
    }
};

app.get("/query=:cpf", async (req, res) => {
    const resultado = await consultarIbioseg(req.params.cpf);
    res.json(resultado);
});

app.listen(9000, "0.0.0.0", () => {
    console.log("Servidor rodando na porta 9000");
});