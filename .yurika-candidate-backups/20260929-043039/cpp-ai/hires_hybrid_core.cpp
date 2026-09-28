// YURIKA Audio 3.7.0 C++/Wasm bandwidth extension + perceptual super-resolution core
// Neural weights originate from the 3.6.1 hierarchical model.
// Frequency/resolution shaping constants mirror matlab-numeric/hires_frequency_resolution_design.m.
// No heap allocation, no exceptions, no standard library.

#include "generated_numeric_coeffs.h"
#include "controller_weights.h"

static const float INV_SCALE[10] = {1.65334843f,1.65392232f,1.65471396f,1.65529402f,4.82512692f,6.33535985f,1.8347311f,2.63025134f,1.6913002f,6.23831298f};
static const float L1W[80] = {0.71337074f,0.220321491f,-0.0418446548f,-0.371460885f,0.819627762f,-0.663589895f,-0.287061214f,-0.317513883f,0.780635357f,-0.0123592187f,0.21564506f,0.266928434f,-0.562503159f,-0.783400595f,0.747423828f,-0.209516153f,-0.0404810272f,0.0969316289f,0.56043148f,0.0342429988f,0.329662532f,-0.246580184f,-0.196168974f,-0.0757854804f,0.397081941f,-0.235160843f,0.0752932131f,-0.00237614126f,0.268490821f,-0.0247907378f,0.324652225f,0.303517759f,-0.0883229226f,-0.419433892f,0.544047058f,0.116774864f,0.0461421423f,0.285700023f,0.00762796542f,0.0141958604f,0.32648769f,0.0807410181f,-0.151723281f,-0.690001905f,0.269789517f,0.275741547f,0.222862333f,-0.0225408506f,0.146375641f,0.000469712599f,0.146369517f,-0.0278784931f,-0.24019371f,0.281173825f,0.49338302f,0.501073301f,0.0386590697f,-0.148267165f,-0.315386117f,-0.0390503742f,-0.210489646f,0.265567601f,-0.183643878f,0.238213703f,-0.500016272f,-0.954641044f,-0.0903984457f,-0.0875242278f,0.158572227f,-0.016863117f,-0.496948451f,0.171655282f,0.159430057f,-0.0722131506f,-0.439540356f,-1.00994909f,0.18297258f,0.350714207f,-0.319237679f,0.0103406608f};
static const float L1B[8] = {-0.257499605f,0.344265729f,0.321592182f,0.321151972f,0.166954815f,-0.193939731f,-0.304613769f,0.197177663f};
static const float L2W[192] = {0.104954354f,0.319014251f,0.278659552f,0.0269447286f,0.254034281f,0.262824297f,0.135583967f,0.0272066984f,0.183375925f,0.198576301f,-0.0186637975f,0.235434726f,0.229775459f,0.464284629f,0.209478989f,0.181247771f,0.315591127f,-0.0564156212f,-0.644156873f,-0.0868863091f,-0.0206988826f,-0.439147919f,0.130228639f,-0.0292196479f,-0.0100002503f,-0.0965107903f,0.0464517958f,0.157482862f,0.202817887f,-0.164642513f,0.248708233f,0.366669089f,0.0935195982f,0.25972563f,0.109317169f,0.193422154f,0.0401958264f,0.0512549616f,-0.0555807427f,0.258051783f,0.278284192f,-0.122474574f,-0.335056305f,0.304586381f,0.3186827f,-0.562142193f,-0.269199789f,0.567446887f,0.0581694134f,-0.143116608f,0.398578405f,0.375006706f,0.166590005f,0.0412902422f,0.201133862f,0.327641845f,-0.0101889288f,0.232391968f,-0.0260236785f,0.0924404934f,0.2960473f,0.180497319f,0.29366529f,-0.0481164604f,-0.00973784924f,0.111608058f,-0.166411072f,0.480254829f,-0.0210227259f,-0.3025828f,-0.0526899286f,0.317126304f,-0.18259792f,0.103657141f,-0.115647614f,-0.266199261f,-0.161361724f,-0.0485721789f,-0.189524189f,0.0459011607f,0.13866289f,-0.00222429051f,-0.0965730622f,0.145926297f,-0.0639178306f,0.0931175426f,0.229132637f,-0.0260434207f,-0.315825671f,0.182817742f,-0.384606421f,-0.252490759f,-0.274894834f,0.0535571314f,0.22205995f,-0.588175416f,0.00410444941f,-0.105590299f,0.05584969f,0.0357474647f,0.0173971951f,-0.172665209f,0.0738763511f,-0.149078682f,-0.245206714f,0.101420119f,0.157822326f,-0.259168118f,0.0959276929f,-0.142122179f,0.166712239f,0.135021448f,-0.0813159347f,-0.136098146f,0.36607191f,0.377110392f,-0.304470479f,0.155490413f,0.297590911f,-0.20979549f,0.132655904f,0.300608844f,-0.0327509381f,0.3449395f,-0.277503014f,0.0240707714f,0.375169218f,0.0870300233f,0.00540441368f,0.0701059401f,0.00647319388f,0.0163013972f,0.112354346f,-0.123995632f,0.0583190955f,0.250200897f,-0.261009663f,0.176514715f,0.0433612242f,-0.303094804f,0.209858552f,-0.0260572806f,0.304766864f,-0.52883178f,-0.0986818895f,0.116294816f,0.190596446f,0.120279111f,0.285276681f,0.0495300703f,-0.00344810146f,0.10819868f,0.353531837f,-0.0786332712f,0.0420830175f,0.400408626f,0.196991697f,0.253464013f,0.11611595f,-0.394703597f,0.167280585f,-0.0165742654f,-0.324111789f,-0.210856706f,-0.143982112f,-0.107944191f,-0.0169703867f,-0.457260281f,0.0689385533f,0.0201795548f,0.0429413803f,0.211511776f,-0.131708041f,0.0828726813f,-0.187633321f,-0.0181273855f,0.125213891f,-0.191897228f,0.153135806f,0.27503553f,-0.0144358855f,-0.0384126417f,0.352638334f,-0.394331664f,-0.0109170871f,0.28331399f,-0.0325536653f,0.107554704f,-0.597326219f,0.271672666f,-0.337699801f,-0.853128254f};
static const float L2B[8] = {-0.13297075f,0.0430499054f,-0.0344588235f,-0.255805314f,-0.204266638f,0.0256687738f,0.0745924264f,-0.176343247f};
static const float L3W[192] = {-0.0970221758f,0.294077009f,0.0887782797f,-0.179732665f,-0.167382136f,0.111621387f,-0.136507079f,-0.16509831f,-0.0329931714f,-0.151931897f,-0.0291605946f,-0.258250773f,0.116946399f,0.0128934123f,0.00569281215f,-0.00414622761f,-0.165516645f,-0.0158198625f,0.207961395f,0.0841133595f,-0.0757013932f,0.0103613483f,-0.190516442f,-0.178304046f,-0.277936012f,0.353265673f,-0.0636584535f,-0.0797032416f,0.0210145302f,-0.392341644f,-0.0319321118f,0.219976112f,-0.140827134f,-0.0239010882f,0.345831841f,-0.129520282f,0.169908389f,-0.252581656f,0.208271846f,-0.335919678f,-0.0294676553f,0.610787928f,-0.18801105f,0.473598659f,0.194634944f,0.130534783f,0.159585729f,-0.320925921f,-0.467735469f,0.800090373f,-0.57530725f,0.291831285f,0.233565077f,-0.404126406f,0.112342708f,0.55074507f,-0.664971471f,0.171978787f,0.365789086f,0.0671562776f,-0.146602079f,-0.0725623965f,0.181487873f,-0.218065113f,0.13678892f,0.465834975f,-0.0529919192f,0.773725629f,-0.122714177f,0.0268753823f,0.792755604f,-0.0437415428f,-0.0954324156f,0.627955556f,-0.396638334f,-0.0615311116f,0.199978277f,0.0753031895f,-0.00151442597f,0.0900740698f,-0.078836523f,0.22386609f,0.141493618f,-0.379909575f,0.338253111f,-0.0604888499f,-0.133096129f,-0.126084194f,0.165428042f,-0.535232246f,0.231947318f,0.459856182f,-0.229765937f,-0.0097040562f,-0.052444011f,-0.233236372f,0.247309431f,0.0940559879f,0.0147098983f,0.0569897331f,-0.171711743f,-0.109881237f,0.151683718f,0.0262268018f,-0.121746257f,-0.0723582134f,0.117610477f,-0.159863517f,0.0976552442f,0.182767287f,0.0346936435f,0.0144868903f,0.0907557383f,-0.368897915f,-0.0770996511f,0.0594310351f,0.195851222f,-0.0796198249f,0.0636404529f,-0.270391226f,-0.146071807f,-0.20957911f,0.0532356687f,-0.0487755984f,-0.270410895f,-0.087676771f,-0.201293647f,-0.205781311f,0.184698075f,-0.143075153f,0.115963235f,0.2712062f,-0.0235545803f,0.160143554f,-0.0304555707f,0.00114843657f,0.0947029293f,-0.123522535f,0.0996962339f,-0.0200064071f,-0.159344703f,-0.168321714f,-0.0727801993f,0.465202659f,0.411207885f,-0.234477416f,0.00745419553f,-0.0381339453f,-0.305299252f,0.295265973f,0.0376186371f,-0.399825841f,0.277420312f,-0.190503001f,-0.160436362f,-0.190397233f,0.23964259f,0.373061717f,-0.234284997f,0.116095118f,0.0791268647f,0.0261099022f,-0.0211310014f,-0.434600234f,-0.111824289f,-0.301454514f,-0.344808161f,-0.76473093f,0.00481645716f,0.425041437f,-0.0545840226f,-0.208157435f,0.381640941f,-0.0421429574f,-0.0691784918f,0.250013709f,-0.0743224695f,0.268019259f,-0.478648424f,0.235875994f,0.210406527f,-0.0771542713f,0.0561111979f,0.0957507342f,0.226320848f,-0.447365284f,-0.263997465f,-0.313057989f,-0.0491504222f,0.0447226018f,-0.478837132f,0.261205852f};
static const float L3B[8] = {0.0980500504f,0.208330736f,-0.214511856f,-0.126561224f,-0.0274405032f,0.157550499f,-0.174510255f,0.0554361381f};
static const float FUSEW[192] = {-0.36037457f,-0.1734972f,-0.279188782f,-0.236455098f,-0.244564369f,-0.148749635f,-0.00401344942f,-0.142989978f,0.00816303585f,-0.102775179f,-0.258463234f,0.0720804557f,0.132900506f,0.0380681492f,0.139808327f,-0.0967445225f,-0.227921188f,0.208228573f,0.262644172f,0.124233536f,-0.0233688168f,-0.403913885f,-0.381740719f,0.421144485f,-0.193386108f,0.0590756461f,-0.0985544398f,0.107790358f,0.265843332f,0.0961353332f,-0.62225765f,-0.687107325f,-0.117004387f,-0.166014031f,-0.0136869987f,0.0506477021f,0.207351848f,0.0788882077f,0.0758128092f,0.195449516f,-0.0832180977f,-0.226681396f,0.00738813309f,-0.3428348f,-0.0235751439f,0.263682812f,-0.216174662f,0.0145375421f,-0.0456968024f,0.235797167f,0.0186233446f,0.169568375f,0.178016648f,0.264031023f,0.186194807f,-0.23411867f,-0.00197102595f,-0.271623909f,-0.261560827f,0.139098629f,0.152766868f,0.241242751f,0.31674546f,0.0717090443f,0.0508247241f,0.292636544f,0.0551823564f,-0.223767281f,-0.170203522f,-0.115809619f,0.19723919f,-0.256512314f,0.0677023828f,0.198592424f,-0.0471531376f,0.160007656f,0.0329530835f,0.0465000495f,-0.0777699724f,-0.0513749458f,0.116198413f,-0.100321263f,-0.0542088524f,0.395147651f,-0.147480413f,0.0658570752f,0.221807331f,0.243886203f,-0.102192312f,-0.3887797f,-0.489129901f,-0.196483314f,-0.229769304f,0.235210046f,-0.0101765906f,0.261728495f,0.25962308f,0.027961364f,-0.0913426951f,-0.166047633f,-0.0997139588f,0.204301387f,-0.356258869f,-0.0570887215f,-0.0749162212f,0.0806217715f,0.258036524f,-0.0529990233f,0.250005096f,-0.210288748f,-0.0808441564f,-0.0664552003f,0.0831538141f,-0.188869178f,-0.197494522f,0.010298308f,0.0248850323f,0.105671421f,0.00343479775f,0.273826927f,0.241589144f,0.00978142861f,-0.22640489f,-0.193052173f,-0.206873551f,0.167857736f,0.571412921f,0.549917579f,0.059733294f,-0.0246439464f,-0.203958988f,0.0356733836f,-0.247661352f,-0.289251328f,0.139628112f,-0.284320623f,0.0850356668f,-0.135595843f,0.0808332562f,0.00524240732f,0.156553403f,-0.211613655f,0.139657766f,0.333524257f,0.153767943f,0.0276055634f,0.0306715462f,0.0209813714f,-0.239288256f,0.125165045f,0.272312373f,0.361556619f,0.0626312941f,0.061448805f,-0.152807131f,-0.106104374f,0.00547486916f,-0.0457614325f,0.0872013718f,0.0288427863f,-0.0636138543f,0.14149636f,-0.178843647f,0.177945435f,0.177411526f,0.0597189628f,-0.146800861f,-0.0270116571f,-0.308544248f,-0.119495295f,0.0452541038f,-0.153366894f,0.0944918394f,-0.00199563731f,0.13811326f,-0.073699668f,-0.168818712f,0.0530519634f,-0.25297907f,0.156864613f,-0.251519144f,-0.10913983f,0.0973293409f,0.0473287217f,-0.173698813f,-0.011680671f,0.217816144f,-0.219427839f,0.116253987f,0.199272662f,-0.0044696331f,-0.0832339525f};
static const float FUSEB[8] = {0.155867592f,-0.00808476284f,-0.0928503722f,-0.043443203f,-0.117917448f,-0.098247081f,-0.0459410809f,-0.0852821842f};
static const float OUTW[8] = {-0.1787965f,0.301199287f,-0.433416694f,-0.370607048f,0.419519693f,-0.247984037f,-0.00832050014f,-0.185083896f};
static const float OUTB[1] = {0.0243799388f};



extern "C" void* memset(void* dst, int value, unsigned long n){ unsigned char* d=(unsigned char*)dst; for(unsigned long i=0;i<n;i++) d[i]=(unsigned char)value; return dst; }
extern "C" void* memcpy(void* dst, const void* src, unsigned long n){ unsigned char* d=(unsigned char*)dst; const unsigned char* s=(const unsigned char*)src; for(unsigned long i=0;i<n;i++) d[i]=s[i]; return dst; }
static const int MAX_FRAMES = 256;
static float INPUT_BUF[MAX_FRAMES*2];
static float OUTPUT_BUF[MAX_FRAMES*2];

struct ChannelState {
  float hist[3]; float fastEnv; float slowEnv;
  float hpX1,hpY1,hp2X1,hp2Y1;
  float detailHpX1,detailHpY1,detailLp;
  float lp5,lp5b,lp5c,lp15,lp15b,lp15c,prevBand,bweAmb;
  float bweHpX1,bweHpY1,bweHp2X1,bweHp2Y1,bweHp3X1,bweHp3Y1,bweHp4X1,bweHp4Y1;
  float nativeHpX1,nativeHpY1,nativeHp2X1,nativeHp2Y1,nativeHp3X1,nativeHp3Y1,nativeHp4X1,nativeHp4Y1,nativeHfEnv;
  float prevResidual, prevResidual2;
  float l1Hist[16]; int l1Pos;
  float l2Hist[64]; int l2Pos;
};
static ChannelState CH[2];
static float sampleRateV=96000.0f, amountV=0.4f;
static float det1=0.5f,det2=0.5f,det3=0.5f,detConfidence=0.0f;
static float hpA1=YURIKA_HP_A1, hpA2=YURIKA_HP_A2;
static float detailHpA=0.70f,detailLpA=0.31f,lpA5=0.72f,lpA15=0.38f,bweHpA1=0.24f,bweHpA2=0.20f,bweHpA3=0.20f,bweHpA4=0.20f,nativeHpA=0.19f,nativeEnvAlpha=0.0002f;
static int nonFiniteCountV=0;
static float probeRmsV=0,probePeakV=0,probeDiffRmsV=0,probeZcrV=0,probeSideRatioV=0;
struct SoftObjectState { int type; float energy,confidence,l1,l2,l3; };
static SoftObjectState OBJ[4]; static int objCount=0;
static float strategyV[4]={0.25f,0.25f,0.25f,0.25f}; static float strategyConfidenceV=0.0f;
static float bweDriveV=0.0f,srDriveV=0.0f,nativeHfRatioV=0.0f;
static int branchMaskV=7; // bit0 learned HF, bit1 perceptual SR, bit2 bandwidth extension
static float hierarchyV[3]={0.33333334f,0.33333334f,0.33333334f}; static float hierarchyConfidenceV=0.0f;

static inline float absf(float x){return x<0?-x:x;}
static inline bool finitef(float x){return x==x && x<3.4028234e38f && x>-3.4028234e38f;}
static inline float clamp1(float x){if(!finitef(x))return 0;return x>1?1:(x<-1?-1:x);}
static inline float clip01(float x){if(!finitef(x))return 0;return x<0?0:(x>1?1:x);}
static inline float fast_tanh(float x){
  if(x>3.0f)x=3.0f; else if(x<-3.0f)x=-3.0f;
  float x2=x*x; return x*(27.0f+x2)/(27.0f+9.0f*x2);
}
static inline float fast_exp(float x){
  if(x>7.0f)x=7.0f; else if(x<-7.0f)x=-7.0f;
  float y=1.0f+x*(1.0f/512.0f); for(int i=0;i<9;i++)y*=y; return y;
}


static inline float fast_sigmoid(float z){float q=fast_exp(-z);return 1.0f/(1.0f+q);}
static void controller_infer(const SoftObjectState &o,float out[6]){
  float x[9]={clip01(o.energy),clip01(o.confidence),clip01(o.l1),clip01(o.l2),clip01(o.l3),0,0,0,0};
  int t=o.type;if(t<0)t=0;if(t>3)t=3;x[5+t]=1.0f;
  float raw[4],sum=0;
  for(int k=0;k<4;k++){float z=YURIKA_CTRL_STRATEGY_B[k];int b=k*9;for(int i=0;i<9;i++)z+=YURIKA_CTRL_STRATEGY_W[b+i]*x[i];float q=fast_exp(z);raw[k]=q;sum+=q;}
  if(sum<1e-6f)sum=1;for(int k=0;k<4;k++)out[k]=raw[k]/sum;
  for(int k=0;k<2;k++){float z=YURIKA_CTRL_DRIVE_B[k];int b=k*9;for(int i=0;i<9;i++)z+=YURIKA_CTRL_DRIVE_W[b+i]*x[i];out[4+k]=fast_sigmoid(z);}
}
static void recompute_strategy(){
  float a[6]={0,0,0,0,0,0},ws=0;
  for(int n=0;n<objCount;n++){float p[6];controller_infer(OBJ[n],p);float w=clip01(OBJ[n].energy)*clip01(OBJ[n].confidence);ws+=w;for(int k=0;k<6;k++)a[k]+=p[k]*w;}
  if(ws<1e-5f){strategyV[0]=strategyV[1]=strategyV[2]=strategyV[3]=0.25f;strategyConfidenceV=0;bweDriveV=0;srDriveV=0;return;}
  float ss=0;for(int k=0;k<4;k++){strategyV[k]=a[k]/ws;ss+=strategyV[k];}if(ss<1e-6f)ss=1;for(int k=0;k<4;k++)strategyV[k]/=ss;
  bweDriveV=clip01(a[4]/ws);srDriveV=clip01(a[5]/ws);strategyConfidenceV=clip01(ws/(float)(objCount>0?objCount:1));
}

static void reset_channel(ChannelState &s){
  for(int i=0;i<3;i++)s.hist[i]=0; s.fastEnv=s.slowEnv=0;
  s.hpX1=s.hpY1=s.hp2X1=s.hp2Y1=0;
  s.detailHpX1=s.detailHpY1=s.detailLp=0;s.lp5=s.lp5b=s.lp5c=s.lp15=s.lp15b=s.lp15c=s.prevBand=s.bweAmb=0;
  s.bweHpX1=s.bweHpY1=s.bweHp2X1=s.bweHp2Y1=s.bweHp3X1=s.bweHp3Y1=s.bweHp4X1=s.bweHp4Y1=0;
  s.nativeHpX1=s.nativeHpY1=s.nativeHp2X1=s.nativeHp2Y1=s.nativeHp3X1=s.nativeHp3Y1=s.nativeHp4X1=s.nativeHp4Y1=s.nativeHfEnv=0;
  s.prevResidual=s.prevResidual2=0;
  for(int i=0;i<16;i++)s.l1Hist[i]=0; for(int i=0;i<64;i++)s.l2Hist[i]=0;
  s.l1Pos=0;s.l2Pos=0;
}

static float infer_sample(float x,float other,int ch){
  ChannelState &s=CH[ch];
  float ax=absf(x); s.fastEnv+=(ax-s.fastEnv)*0.22f; s.slowEnv+=(ax-s.slowEnv)*0.012f;
  float dx=x-s.hist[0], ddx=x-2.0f*s.hist[0]+s.hist[1], mid=0.5f*(x+other), side=0.5f*(x-other);
  float f[10]={x,s.hist[0],s.hist[1],s.hist[2],dx,ddx,s.fastEnv,s.slowEnv,mid,side};
  float l1[8],l2[8],l3[8],fu[8];
  for(int o=0;o<8;o++){float z=L1B[o];int base=o*10;for(int i=0;i<10;i++)z+=L1W[base+i]*(f[i]*INV_SCALE[i]);l1[o]=fast_tanh(z);}
  int p1=s.l1Pos, old=p1, prev=(p1+1)&1;
  for(int o=0;o<8;o++){float z=L2B[o];int base=o*24;for(int i=0;i<8;i++){z+=L2W[base+i*3]*s.l1Hist[old*8+i];z+=L2W[base+i*3+1]*s.l1Hist[prev*8+i];z+=L2W[base+i*3+2]*l1[i];}l2[o]=fast_tanh(z);}
  for(int i=0;i<8;i++)s.l1Hist[p1*8+i]=l1[i]; s.l1Pos=(p1+1)&1;
  int p2=s.l2Pos, p4=(p2+4)&7;
  for(int o=0;o<8;o++){float z=L3B[o];int base=o*24;for(int i=0;i<8;i++){z+=L3W[base+i*3]*s.l2Hist[p2*8+i];z+=L3W[base+i*3+1]*s.l2Hist[p4*8+i];z+=L3W[base+i*3+2]*l2[i];}l3[o]=fast_tanh(z);}
  for(int i=0;i<8;i++)s.l2Hist[p2*8+i]=l2[i]; s.l2Pos=(p2+1)&7;

  // MATLAB-designed continuous object-index coupling.
  float q1=(det1-0.5f)*detConfidence, q2=(det2-0.5f)*detConfidence, q3=(det3-0.5f)*detConfidence;
  float g1=1.0f + YURIKA_OBJECT_GAIN_MATRIX[0]*q1 + YURIKA_OBJECT_GAIN_MATRIX[1]*q2 + YURIKA_OBJECT_GAIN_MATRIX[2]*q3;
  float g2=1.0f + YURIKA_OBJECT_GAIN_MATRIX[3]*q1 + YURIKA_OBJECT_GAIN_MATRIX[4]*q2 + YURIKA_OBJECT_GAIN_MATRIX[5]*q3;
  float g3=1.0f + YURIKA_OBJECT_GAIN_MATRIX[6]*q1 + YURIKA_OBJECT_GAIN_MATRIX[7]*q2 + YURIKA_OBJECT_GAIN_MATRIX[8]*q3;
  for(int o=0;o<8;o++){float z=FUSEB[o];int base=o*24;for(int i=0;i<8;i++){z+=FUSEW[base+i]*(l1[i]*g1);z+=FUSEW[base+8+i]*(l2[i]*g2);z+=FUSEW[base+16+i]*(l3[i]*g3);}fu[o]=fast_tanh(z);}
  float z=OUTB[0];for(int i=0;i<8;i++)z+=OUTW[i]*fu[i];
  float r=0.08f*fast_tanh(z);

  // 3.7.0: paired-audio controller drives perceptual SR and true upper-band synthesis separately.
  float srDrive=clip01(srDriveV*(0.35f+0.65f*strategyConfidenceV));
  float bweDrive=clip01(bweDriveV*strategyConfidenceV);
  float prevR=s.prevResidual, prevR2=s.prevResidual2;
  float d1=r-prevR; float d2=r-2.0f*prevR+prevR2;
  float detailMix=YURIKA_RESOLUTION_BASE[0]*(0.52f+0.58f*srDrive+0.30f*det1*detConfidence);
  float curvatureMix=YURIKA_RESOLUTION_BASE[1]*(0.58f+0.56f*srDrive+0.22f*det2*detConfidence);
  float baseShaped=r + detailMix*d1 + curvatureMix*d2;
  float harmonic=r + (0.16f+0.18f*det2*detConfidence)*d1 + 0.035f*d2;
  float transient=0.58f*d1 + 0.22f*d2;
  float texture=0.58f*r + 0.30f*d1 - 0.07f*d2;
  float ambience=0.82f*r + 0.18f*prevR;

  // Hierarchy remains a continuous routing prior: micro/local/context are never hard switched.
  float hw1=hierarchyV[0],hw2=hierarchyV[1],hw3=hierarchyV[2];
  float profileH=0.14f*hw1+0.46f*hw2+0.38f*hw3;
  float profileT=0.48f*hw1+0.18f*hw2+0.06f*hw3;
  float profileX=0.28f*hw1+0.28f*hw2+0.16f*hw3;
  float profileA=0.10f*hw1+0.08f*hw2+0.40f*hw3;
  float hb=0.30f*hierarchyConfidenceV;
  float ew0=strategyV[0]*(1.0f-hb)+profileH*hb;
  float ew1=strategyV[1]*(1.0f-hb)+profileT*hb;
  float ew2=strategyV[2]*(1.0f-hb)+profileX*hb;
  float ew3=strategyV[3]*(1.0f-hb)+profileA*hb;
  float ews=ew0+ew1+ew2+ew3;if(ews<1e-6f)ews=1.0f;ew0/=ews;ew1/=ews;ew2/=ews;ew3/=ews;
  float controlled=ew0*harmonic+ew1*transient+ew2*texture+ew3*ambience;
  float microShape=0.70f*r+0.48f*d1+0.12f*d2;
  float localShape=r+(0.14f+0.14f*det2*detConfidence)*d1+0.03f*d2;
  float contextShape=0.84f*r+0.16f*prevR;
  float hierarchyGenerated=hw1*microShape+hw2*localShape+hw3*contextShape;
  float hierarchyMix=0.20f*hierarchyConfidenceV;
  float hierarchyShaped=baseShaped*(1.0f-hierarchyMix)+hierarchyGenerated*hierarchyMix;
  float controllerMix=0.42f*strategyConfidenceV;
  float shaped=hierarchyShaped*(1.0f-controllerMix)+controlled*controllerMix;
  s.prevResidual2=prevR; s.prevResidual=r;

  // Learned high-band residual branch retained from 3.6.x, now sample-rate-aware.
  float h1=hpA1*(s.hpY1+shaped-s.hpX1); s.hpX1=shaped;s.hpY1=h1;
  float h2=hpA2*(s.hp2Y1+h1-s.hp2X1); s.hp2X1=h1;s.hp2Y1=h2;

  // Perceptual super-resolution branch: causal 5.5-18 kHz detail band, zero lookahead.
  float dh=detailHpA*(s.detailHpY1+shaped-s.detailHpX1);s.detailHpX1=shaped;s.detailHpY1=dh;
  s.detailLp=(1.0f-detailLpA)*dh+detailLpA*s.detailLp;
  float perceptualDetail=s.detailLp;

  // Bandwidth extension branch. 5.5-15 kHz content is nonlinearly extrapolated,
  // then cascaded high-pass stages retain mainly newly generated >~22 kHz energy.
  s.lp5=(1.0f-lpA5)*x+lpA5*s.lp5;s.lp5b=(1.0f-lpA5)*s.lp5+lpA5*s.lp5b;s.lp5c=(1.0f-lpA5)*s.lp5b+lpA5*s.lp5c;
  s.lp15=(1.0f-lpA15)*x+lpA15*s.lp15;s.lp15b=(1.0f-lpA15)*s.lp15+lpA15*s.lp15b;s.lp15c=(1.0f-lpA15)*s.lp15b+lpA15*s.lp15c;
  float band=s.lp15c-s.lp5c, db=band-s.prevBand;s.prevBand=band;
  float b2=band*band, cubic=(band*b2)/(0.00045f+b2), quad=(band*absf(band))/(0.020f+absf(band));
  float transNL=(db*absf(db))/(0.012f+absf(db));
  float texNL=(band*db)/(0.008f+absf(band)+absf(db));
  float ambTarget=0.62f*cubic+0.38f*quad;s.bweAmb+=0.08f*(ambTarget-s.bweAmb);
  float rawBwe=ew0*(0.72f*cubic+0.28f*quad)+ew1*transNL+ew2*(0.52f*quad+0.48f*texNL)+ew3*s.bweAmb;
  float bh1=bweHpA1*(s.bweHpY1+rawBwe-s.bweHpX1);s.bweHpX1=rawBwe;s.bweHpY1=bh1;
  float bh2=bweHpA2*(s.bweHp2Y1+bh1-s.bweHp2X1);s.bweHp2X1=bh1;s.bweHp2Y1=bh2;
  float bh3=bweHpA3*(s.bweHp3Y1+bh2-s.bweHp3X1);s.bweHp3X1=bh2;s.bweHp3Y1=bh3;
  float bh4=bweHpA4*(s.bweHp4Y1+bh3-s.bweHp4X1);s.bweHp4X1=bh3;s.bweHp4Y1=bh4;

  // Protect genuine high-resolution sources: if native >25 kHz energy already exists,
  // content-derived hallucination is continuously reduced rather than hard-disabled.
  float nh1=nativeHpA*(s.nativeHpY1+x-s.nativeHpX1);s.nativeHpX1=x;s.nativeHpY1=nh1;
  float nh2=nativeHpA*(s.nativeHp2Y1+nh1-s.nativeHp2X1);s.nativeHp2X1=nh1;s.nativeHp2Y1=nh2;
  float nh3=nativeHpA*(s.nativeHp3Y1+nh2-s.nativeHp3X1);s.nativeHp3X1=nh2;s.nativeHp3Y1=nh3;
  float nh4=nativeHpA*(s.nativeHp4Y1+nh3-s.nativeHp4X1);s.nativeHp4X1=nh3;s.nativeHp4Y1=nh4;
  s.nativeHfEnv+=(absf(nh4)-s.nativeHfEnv)*nativeEnvAlpha;
  float nativeRatio=s.nativeHfEnv/(s.slowEnv+1e-5f);if(nativeRatio>1.0f)nativeRatio=1.0f;
  nativeHfRatioV+=0.0006f*(nativeRatio-nativeHfRatioV);
  float nativeProtect=1.0f-clip01((nativeRatio-0.0007f)/0.0020f);

  float gate=clip01((s.slowEnv-YURIKA_GATE_FLOOR)/YURIKA_GATE_SPAN);
  float learnedHF=h2*(0.42f+0.58f*srDrive);
  float inBand=perceptualDetail*(0.03f+0.13f*srDrive)*(0.35f+0.65f*strategyConfidenceV);
  float generatedHF=bh4*(0.05f+0.35f*bweDrive)*nativeProtect*strategyConfidenceV;
  float branchLearned=(branchMaskV&1)?0.62f*learnedHF:0.0f;
  float branchSr=(branchMaskV&2)?inBand:0.0f;
  float branchBwe=(branchMaskV&4)?generatedHF:0.0f;
  float inj=(branchLearned+branchSr+branchBwe)*amountV*gate;
  if(inj>YURIKA_MAX_INJECTION)inj=YURIKA_MAX_INJECTION; else if(inj<-YURIKA_MAX_INJECTION)inj=-YURIKA_MAX_INJECTION;
  s.hist[2]=s.hist[1];s.hist[1]=s.hist[0];s.hist[0]=x;
  if(!finitef(inj)){nonFiniteCountV++;return 0;}
  return inj;
}

extern "C" {
__attribute__((visibility("default"))) float* yurika_input(){return INPUT_BUF;}
__attribute__((visibility("default"))) float* yurika_output(){return OUTPUT_BUF;}
__attribute__((visibility("default"))) void yurika_reset(float fs){sampleRateV=(finitef(fs)&&fs>=8000.0f&&fs<=384000.0f)?fs:96000.0f;amountV=0.4f;det1=det2=det3=0.5f;detConfidence=0;nonFiniteCountV=0;objCount=0;strategyV[0]=strategyV[1]=strategyV[2]=strategyV[3]=0.25f;strategyConfidenceV=0;bweDriveV=0;srDriveV=0;nativeHfRatioV=0;branchMaskV=7;hierarchyV[0]=hierarchyV[1]=hierarchyV[2]=0.33333334f;hierarchyConfidenceV=0;
  const float tau=6.283185307f/sampleRateV;float fc1=sampleRateV*0.195f;if(fc1>19000)fc1=19000;float fc2=sampleRateV*0.235f;if(fc2>22500)fc2=22500;
  hpA1=fast_exp(-tau*fc1);hpA2=fast_exp(-tau*fc2);detailHpA=fast_exp(-tau*5500.0f);detailLpA=fast_exp(-tau*18000.0f);lpA5=fast_exp(-tau*5500.0f);lpA15=fast_exp(-tau*15000.0f);bweHpA1=fast_exp(-tau*20500.0f);bweHpA2=fast_exp(-tau*22000.0f);bweHpA3=fast_exp(-tau*23500.0f);bweHpA4=fast_exp(-tau*24500.0f);nativeHpA=fast_exp(-tau*24500.0f);nativeEnvAlpha=1.0f-fast_exp(-1.0f/(sampleRateV*0.050f));
  reset_channel(CH[0]);reset_channel(CH[1]);}
__attribute__((visibility("default"))) void yurika_set_amount(float a){amountV=clip01(a);}
__attribute__((visibility("default"))) void yurika_set_detector(float l1,float l2,float l3,float c){det1=clip01(l1);det2=clip01(l2);det3=clip01(l3);detConfidence=clip01(c);}
__attribute__((visibility("default"))) void yurika_set_hierarchy_weights(float w1,float w2,float w3,float c){
  w1=clip01(w1);w2=clip01(w2);w3=clip01(w3);float s=w1+w2+w3;
  if(s<1e-6f){hierarchyV[0]=hierarchyV[1]=hierarchyV[2]=0.33333334f;hierarchyConfidenceV=0;return;}
  hierarchyV[0]=w1/s;hierarchyV[1]=w2/s;hierarchyV[2]=w3/s;hierarchyConfidenceV=clip01(c);
}
__attribute__((visibility("default"))) float yurika_hierarchy_weight(int i){return (i>=0&&i<3)?hierarchyV[i]:0;}
__attribute__((visibility("default"))) float yurika_hierarchy_confidence(){return hierarchyConfidenceV;}
__attribute__((visibility("default"))) void yurika_clear_objects(){objCount=0;strategyV[0]=strategyV[1]=strategyV[2]=strategyV[3]=0.25f;strategyConfidenceV=0;bweDriveV=0;srDriveV=0;}
__attribute__((visibility("default"))) void yurika_set_object(int slot,int type,float energy,float confidence,float l1,float l2,float l3){if(slot<0||slot>=4)return;OBJ[slot].type=type;OBJ[slot].energy=clip01(energy);OBJ[slot].confidence=clip01(confidence);OBJ[slot].l1=clip01(l1);OBJ[slot].l2=clip01(l2);OBJ[slot].l3=clip01(l3);if(slot+1>objCount)objCount=slot+1;}
__attribute__((visibility("default"))) void yurika_commit_objects(int count){if(count<0)count=0;if(count>4)count=4;objCount=count;recompute_strategy();}
__attribute__((visibility("default"))) float yurika_strategy(int i){return (i>=0&&i<4)?strategyV[i]:0;}
__attribute__((visibility("default"))) float yurika_strategy_confidence(){return strategyConfidenceV;}
__attribute__((visibility("default"))) float yurika_bwe_drive(){return bweDriveV;}
__attribute__((visibility("default"))) float yurika_sr_drive(){return srDriveV;}
__attribute__((visibility("default"))) float yurika_native_hf_ratio(){return nativeHfRatioV;}
__attribute__((visibility("default"))) void yurika_set_branch_mask(int mask){branchMaskV=mask&7;}
__attribute__((visibility("default"))) int yurika_branch_mask(){return branchMaskV;}
__attribute__((visibility("default"))) int yurika_object_count(){return objCount;}
__attribute__((visibility("default"))) int yurika_process(int frames,int channels){
  if(frames<1)return 0;if(frames>MAX_FRAMES)frames=MAX_FRAMES;if(channels<1)channels=1;if(channels>2)channels=2;
  float sum=0,diff=0,sideSq=0,peak=0,prev=0;int zc=0;bool have=false;
  for(int i=0;i<frames;i++){
    float l=INPUT_BUF[i*2],r=channels>1?INPUT_BUF[i*2+1]:l; if(!finitef(l))l=0;if(!finitef(r))r=l;
    float m=0.5f*(l+r),sd=0.5f*(l-r),am=absf(m);if(am>peak)peak=am;sum+=m*m;sideSq+=sd*sd;
    if(have){float dd=m-prev;diff+=dd*dd;if((m>=0)!=(prev>=0))zc++;}else have=true; prev=m;
    float il=infer_sample(l,r,0),ir=channels>1?infer_sample(r,l,1):il;
    OUTPUT_BUF[i*2]=clamp1(l+il); OUTPUT_BUF[i*2+1]=channels>1?clamp1(r+ir):OUTPUT_BUF[i*2];
  }
  float n=(float)frames; probeRmsV=__builtin_sqrtf(sum/(n>0?n:1));probePeakV=peak;probeDiffRmsV=__builtin_sqrtf(diff/(frames>1?(float)(frames-1):1));
  float sideR=__builtin_sqrtf(sideSq/(n>0?n:1)); probeZcrV=frames>1?(float)zc/(float)(frames-1):0; probeSideRatioV=sideR/(probeRmsV>1e-6f?probeRmsV:1e-6f); if(probeSideRatioV>1)probeSideRatioV=1;
  return frames;
}
__attribute__((visibility("default"))) float yurika_probe_rms(){return probeRmsV;}
__attribute__((visibility("default"))) float yurika_probe_peak(){return probePeakV;}
__attribute__((visibility("default"))) float yurika_probe_diff_rms(){return probeDiffRmsV;}
__attribute__((visibility("default"))) float yurika_probe_zcr(){return probeZcrV;}
__attribute__((visibility("default"))) float yurika_probe_side_ratio(){return probeSideRatioV;}
__attribute__((visibility("default"))) int yurika_nonfinite_count(){return nonFiniteCountV;}
__attribute__((visibility("default"))) int yurika_model_params(){return 697;}
__attribute__((visibility("default"))) int yurika_controller_params(){return 60;}
}
