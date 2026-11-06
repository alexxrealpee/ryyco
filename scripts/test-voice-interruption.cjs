const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const ts=require('typescript');
test('noise does not cancel speech; recognized speech interrupts once even with duplicate transport events',async()=>{
 let instance;const sent=[],transcripts=[];const track={enabled:true,stop(){}};const stream={getTracks:()=>[track],getAudioTracks:()=>[track]};
 class Session{constructor(agent,options){instance=this;this.events={};this.handlers={};this.config=options.config;this.transport={on:(name,fn)=>this.handlers[name]=fn,updateSessionConfig:()=>{},sendEvent:event=>sent.push(event)};}on(name,fn){this.events[name]=fn;}async connect(){}interrupt(){sent.push({type:'interrupted'});}close(){}}
 const catalog={version:1,stores:[],products:[],profilesMap:{},isLoaded:true};
 const modules={'@openai/agents':{tool:definition=>definition},'@openai/agents/realtime':{RealtimeSession:Session,RealtimeAgent:class{constructor(data){Object.assign(this,data);}}},zod:require('zod'),'./firebase':{},'./catalogManager':{getClientAvailableCatalog:()=>catalog,subscribeToAvailableCatalog:()=>()=>{},isRestaurantOpenNow:()=>false},'./cartHelper':{},'./apiConfig':{smartApiFetch:async()=>new Response(JSON.stringify({value:'test-session'}))}};
 const ctx={exports:{},require:name=>modules[name],console:{log(){},warn(){}},setTimeout,clearTimeout,AbortSignal,navigator:{mediaDevices:{getUserMedia:async()=>stream}},window:{},Audio:class{constructor(){this.paused=false;}play(){return Promise.resolve();}pause(){}}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/realtimeMeseroAgent.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,ctx);
 const manager=new ctx.exports.RealtimeMeseroManager({onStateChange(){},onTranscriptDelta:text=>transcripts.push(text)});await manager.start({shouldGreet:false});
 assert.equal(instance.config.audio.input.turnDetection.interruptResponse,false);assert.equal(instance.config.audio.input.turnDetection.createResponse,false);
 instance.events.transport_event({type:'response.created'});
 instance.events.transport_event({type:'input_audio_buffer.speech_started'});
 instance.events.transport_event({type:'conversation.item.input_audio_transcription.completed',item_id:'noise',transcript:'[ruido]'});
 assert.equal(sent.filter(e=>e.type==='interrupted').length,0);
 const speech={type:'conversation.item.input_audio_transcription.completed',item_id:'human',transcript:'Quiero una hamburguesa'};
 instance.events.transport_event(speech);instance.handlers['*'](speech);
 assert.equal(sent.filter(e=>e.type==='interrupted').length,1);assert.equal(sent.filter(e=>e.type==='response.create').length,1);assert.deepEqual(transcripts,['Quiero una hamburguesa']);
 instance.events.audio_start();instance.events.transport_event({type:'response.done'});
 instance.events.transport_event({type:'conversation.item.input_audio_transcription.completed',item_id:'next-human',transcript:'Sin cebolla'});
 assert.equal(sent.filter(e=>e.type==='interrupted').length,2);manager.stop();
});
